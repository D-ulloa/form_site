import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { FieldErrors } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { usePropertyForm } from '../features/properties/hooks/usePropertyForm.ts';
import { useMediaValidation } from '../features/properties/hooks/useMediaValidation.ts';
import { useCreatePropertySubmission } from '../features/properties/hooks/useCreatePropertySubmission.ts';
import { useRecoveryDraft } from '../features/properties/hooks/useRecoveryDraft.ts';
import type { RecoveryFailure, RecoveryMediaFile, RecoverySnapshot } from '../features/properties/services/recoveryDraftApi.ts';
import type { FileEntry } from '../components/ui/FileDropzone.tsx';
import {
  buildFormData,
  buildPropertySubmitPayload,
  type MediaUploadMetadata,
} from '../features/properties/services/payloadMapper.ts';
import {
  buildMediaMetadataFromPresigned,
  getMediaUploadProvider,
  requestMediaUploadUrls,
  uploadFileToSupabase,
} from '../features/properties/services/propertyApi.ts';
import { BasicInfoSection } from '../features/properties/components/BasicInfoSection.tsx';
import { LocationSection } from '../features/properties/components/LocationSection.tsx';
import { DistributionSection } from '../features/properties/components/DistributionSection.tsx';
import { FeaturesSection } from '../features/properties/components/FeaturesSection.tsx';
import { AdditionalDetailsSection } from '../features/properties/components/AdditionalDetailsSection.tsx';
import { MediaUploadSection } from '../features/properties/components/MediaUploadSection.tsx';
import { Button } from '../components/ui/Button.tsx';
import { AlertInline } from '../components/ui/AlertInline.tsx';
import type { PropertyFormInput, PropertyFormValues } from '../features/properties/schemas/propertySchema.ts';
import type { SubmissionResult } from '../features/properties/services/propertyApi.ts';
import { useOrganization } from '../app/contexts/OrganizationContext.tsx';
import { useAuthentication } from '../app/contexts/AuthenticationContext.tsx';

type SubmissionPhase = 'idle' | 'validating' | 'preparing' | 'uploading' | 'submitting';

function recoverySnapshot(values: PropertyFormInput, files: FileEntry[],
  missingFiles: RecoveryMediaFile[], coverFileName: string): RecoverySnapshot {
  const formValues = Object.fromEntries(Object.entries(values)
    .filter(([key, value]) => !key.startsWith('agent_')
      && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))
    .map(([key, value]) => [key, typeof value === 'number' && !Number.isFinite(value) ? '' : value])
  ) as RecoverySnapshot['formValues'];
  return {
    formValues,
    mediaManifest: [
      ...files.map(({ file }) => ({ name: file.name, mimeType: file.type,
        sizeBytes: file.size, lastModified: file.lastModified })),
      ...missingFiles,
    ],
    coverFileName,
  };
}

function recoveryFailure(error: unknown, phase: RecoveryFailure['phase'],
  resultOverride?: SubmissionResult): RecoveryFailure {
  const response = axios.isAxiosError(error) ? error.response : undefined;
  const responseBody = response?.data as Partial<SubmissionResult> | undefined;
  const typed = error as { status?: number; result?: SubmissionResult } | null;
  const result = resultOverride ?? typed?.result ??
    (responseBody?.outcome === 'failure' || responseBody?.outcome === 'partial_failure'
      ? responseBody as SubmissionResult : undefined);
  const httpStatus = response?.status ?? typed?.status;
  const details = (response?.data as { details?: unknown } | undefined)?.details;
  const responseMessage = Array.isArray(details) ? details.filter((item): item is string => typeof item === 'string').join(', ')
    : typeof details === 'string' ? details : undefined;
  const rawMessage = result?.error ?? responseMessage ??
    (error instanceof Error ? error.message : 'Error inesperado al enviar la propiedad.');
  const message = rawMessage.replace(/https?:\/\/\S+/giu, '[URL]')
    .replace(/Bearer\s+\S+/giu, 'Bearer [redactado]')
    .replace(/\b(api[_-]?key|token|secret|password)=\S+/giu, '$1=[redactado]')
    .slice(0, 500);
  return {
    phase,
    code: result?.outcome === 'partial_failure' ? 'PARTIAL_FAILURE'
      : result?.outcome === 'failure' ? 'SUBMISSION_FAILURE'
        : httpStatus ? `HTTP_${httpStatus}` : phase === 'validation' ? 'FORM_VALIDATION_FAILED' : 'NETWORK_OR_CLIENT_ERROR',
    message: message || 'Error inesperado al enviar la propiedad.',
    ...(httpStatus ? { httpStatus } : {}),
    ...(result?.outcome === 'failure' || result?.outcome === 'partial_failure'
      ? { outcome: result.outcome } : {}),
    ...(result?.steps ? { steps: result.steps as unknown as RecoveryFailure['steps'] } : {}),
    ...(result?.submission_id ? { submissionId: result.submission_id } : {}),
    ...(result?.property_id ? { propertyId: result.property_id } : {}),
  };
}

export function NewPropertyPage() {
  const navigate = useNavigate();
  const organization = useOrganization();
  const { session: adminSession } = useAuthentication();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uncertainSubmit, setUncertainSubmit] = useState(false);
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>('idle');
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const mediaUploadRequest = useRef<AbortController | null>(null);

  useEffect(() => () => { mediaUploadRequest.current?.abort(); }, []);

  const form = usePropertyForm();
  const media = useMediaValidation();
  const { mutateAsync, isPending } = useCreatePropertySubmission(organization.organization.slug);
  const recovery = useRecoveryDraft(organization.organization.slug, adminSession?.user.id);
  const { scheduleSave } = recovery;
  const [missingMedia, setMissingMedia] = useState<RecoveryMediaFile[]>([]);
  const [restoredCover, setRestoredCover] = useState('');
  const { setValue } = form;
  const agentUserId = adminSession?.user.id;
  const agentName = adminSession?.user.name;
  const agentEmail = adminSession?.user.email;

  useEffect(() => {
    if (!agentUserId || agentName === undefined || agentEmail === undefined) return;
    setValue('agent_user_id', agentUserId, { shouldValidate: true, shouldDirty: false });
    setValue('agent_name', agentName, { shouldValidate: true, shouldDirty: false });
    setValue('agent_email', agentEmail, { shouldValidate: true, shouldDirty: false });
  }, [agentUserId, agentName, agentEmail, setValue]);

  const {
    handleSubmit,
    formState: { errors, isSubmitted },
  } = form;

  const errorCount = Object.keys(errors).length;
  const isLoading = isPending || submissionPhase !== 'idle';
  const provider = getMediaUploadProvider();
  const snapshot = useCallback(() => recoverySnapshot(form.getValues(), media.files, missingMedia,
    media.coverFileName || restoredCover),
  [form, media.files, media.coverFileName, missingMedia, restoredCover]);

  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (!name || name.startsWith('agent_')) return;
      scheduleSave(snapshot());
    });
    return () => subscription.unsubscribe();
  }, [form, scheduleSave, snapshot]);

  const submitButtonLabel = (() => {
    switch (submissionPhase) {
      case 'validating': return 'Validando…';
      case 'preparing': return 'Preparando carga…';
      case 'uploading': return `Subiendo archivos (${uploadProgress.completed}/${uploadProgress.total})…`;
      case 'submitting': return 'Enviando propiedad…';
      default: return isPending ? 'Enviando propiedad…' : 'Enviar propiedad';
    }
  })();

  const handleSubmitError = async (error: unknown, phase: RecoveryFailure['phase'],
    result?: SubmissionResult): Promise<void> => {
    const failure = recoveryFailure(error, phase, result);
    setSubmissionPhase('idle');
    setValidationError(null);
    setSubmitError(error instanceof Error ? error.message : failure.message);
    if (phase === 'submit') setUncertainSubmit(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await recovery.recordFailure(snapshot(), failure).catch(() => undefined);
  };

  const handleInvalidSubmit = async (submitErrors: FieldErrors<PropertyFormInput>): Promise<void> => {
    setSubmissionPhase('idle');
    setSubmitError(null);
    setValidationError('Revisá los campos marcados en rojo antes de enviar.');

    const firstErrorName = Object.keys(submitErrors)[0];

    window.requestAnimationFrame(() => {
      const selector =
        firstErrorName && typeof CSS !== 'undefined'
          ? `[name="${CSS.escape(firstErrorName)}"]`
          : '.is-error, [aria-invalid="true"]';
      const target = document.querySelector<HTMLElement>(selector);

      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target?.focus({ preventScroll: true });
    });
    await recovery.recordFailure(snapshot(), {
      phase: 'validation', code: 'FORM_VALIDATION_FAILED',
      message: `Campos inválidos: ${Object.keys(submitErrors).slice(0, 10).join(', ')}`.slice(0, 500),
    }).catch(() => undefined);
  };

  const finishSubmission = async (result: SubmissionResult): Promise<void> => {
    if (result.outcome !== 'success') {
      await handleSubmitError(new Error(result.error ?? 'El envío no se completó.'), 'submit', result);
      return;
    }
    setSubmissionPhase('idle');
    setUncertainSubmit(false);
    setMissingMedia([]);
    setRestoredCover('');
    if (result.recovery_draft_closed !== false) {
      await recovery.markComplete().catch(() => undefined);
    }
    navigate(`/t/${organization.organization.slug}/properties/success/${result.submission_id}`, {
      state: { result },
    });
  };

  const onValidSubmit = async (values: PropertyFormValues) => {
    if (!adminSession) {
      setSubmissionPhase('idle');
      navigate('/login', { replace: true });
      return;
    }
    if (!media.isValid) {
      await handleSubmitError(new Error(media.sizeError ?? 'Los archivos multimedia no son válidos.'), 'media_validation');
      return;
    }
    if (missingMedia.length > 0) {
      await handleSubmitError(new Error('Volvé a seleccionar los archivos pendientes antes de enviar.'), 'media_validation');
      return;
    }
    const previousFailure = recovery.currentDraft?.last_error;
    if ((uncertainSubmit || (previousFailure?.phase === 'submit' &&
      (previousFailure.outcome === 'partial_failure' || previousFailure.submission_id || !previousFailure.http_status))) &&
      !window.confirm('El envío anterior pudo haber creado datos en Drive, Sheets o Make. Revisá el resultado antes de reenviar para evitar duplicados. ¿Querés continuar?')) {
      setSubmissionPhase('idle');
      return;
    }

    setSubmitError(null);
    setValidationError(null);
    let savedDraft;
    try {
      savedDraft = await recovery.saveNow(snapshot());
    } catch {
      setSubmissionPhase('idle');
      setSubmitError('No se pudo guardar el borrador antes del envío. Revisá tu conexión e intentá nuevamente.');
      return;
    }

    if (provider === 'drive') {
      const fd = buildFormData(values, media.files, media.coverFileName);
      setSubmissionPhase('submitting');
      try {
        await finishSubmission(await mutateAsync({ mode: 'legacy', formData: fd, recoveryDraftId: savedDraft.id }));
      } catch (error) { await handleSubmitError(error, 'submit'); }
      return;
    }

    if (media.files.length === 0) {
      const payload = buildPropertySubmitPayload(
        values,
        [],
        undefined,
        media.coverFileName,
      );

      setSubmissionPhase('submitting');
      try {
        await finishSubmission(await mutateAsync({ mode: 'json', payload, recoveryDraftId: savedDraft.id }));
      } catch (error) { await handleSubmitError(error, 'submit'); }
      return;
    }

    const controller = new AbortController();
    mediaUploadRequest.current = controller;
    let failurePhase: RecoveryFailure['phase'] = 'presign';
    try {
      setSubmissionPhase('preparing');
      setUploadProgress({ completed: 0, total: media.files.length });
      const presignRequestFiles = media.files.map((entry) => ({
        originalName: entry.file.name,
        mimeType: entry.file.type,
        sizeBytes: entry.file.size,
      }));

      const presignResponse = await requestMediaUploadUrls(
        organization.organization.slug,
        presignRequestFiles,
        controller.signal,
      );
      if (controller.signal.aborted) return;

      setSubmissionPhase('uploading');
      failurePhase = 'upload';
      const uploadedMedia: MediaUploadMetadata[] = [];

      for (let i = 0; i < media.files.length; i += 1) {
        const entry = media.files[i];
        const upload = presignResponse.media_uploads[i];
        if (!entry || !upload) {
          throw new Error('Error de sesión de carga: falta información de presign para uno de los archivos.');
        }

        await uploadFileToSupabase(entry.file, upload.uploadUrl, entry.file.type, controller.signal);
        if (controller.signal.aborted) return;
        setUploadProgress({ completed: i + 1, total: media.files.length });
        uploadedMedia.push(buildMediaMetadataFromPresigned(entry.file, {
          originalName: upload.originalName,
          uploadUrl: upload.uploadUrl,
          publicPath: upload.publicPath,
          storagePath: upload.storagePath,
          storageBucket: upload.storageBucket,
        }));
      }

      const payload = buildPropertySubmitPayload(
        values,
        uploadedMedia,
        presignResponse.upload_session_id,
        media.coverFileName,
      );

      setSubmissionPhase('submitting');
      failurePhase = 'submit';
      await finishSubmission(await mutateAsync({ mode: 'json', payload, recoveryDraftId: savedDraft.id }));
    } catch (err) {
      if (controller.signal.aborted) return;
      await handleSubmitError(err, failurePhase);
    } finally {
      if (mediaUploadRequest.current === controller) mediaUploadRequest.current = null;
    }
  };

  if (!adminSession) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--bg-base)] text-sm text-slate-400" role="status">
        Comprobando sesión…
      </main>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="glass border-b border-white/[0.07] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Volver"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-slate-100">Nueva propiedad</h1>
            <p className="text-xs text-slate-500">Completá todos los campos requeridos (*)</p>
          </div>
          <span className="text-xs text-slate-500">{adminSession.user.name}</span>
        </div>
      </header>

      {/* Form */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8">
        <form
          id="property-form"
          onSubmit={(event) => {
            setSubmissionPhase('validating');
            void handleSubmit(onValidSubmit, handleInvalidSubmit)(event).catch((error: unknown) => {
              void handleSubmitError(error, 'unexpected');
            });
          }}
          noValidate
          className="flex flex-col gap-6"
        >
          {recovery.drafts.length > 0 && (
            <section className="surface rounded-2xl p-4" aria-label="Borradores sin envío exitoso">
              <h2 className="text-sm font-semibold text-slate-200 mb-3">Borradores pendientes ({recovery.drafts.length})</h2>
              <ul className="space-y-2">
                {recovery.drafts.map((draft) => (
                  <li key={draft.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-200">{draft.title || draft.address || 'Propiedad sin título'}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(draft.updatedAt).toLocaleString('es-AR')}
                        {draft.lastError ? ` · ${draft.lastError.message}` : ' · Sin enviar'}
                      </p>
                    </div>
                    <button type="button" className="text-xs text-indigo-300 hover:text-indigo-200"
                      onClick={() => {
                        if (form.formState.isDirty && !window.confirm('¿Reemplazar los cambios actuales con este borrador?')) return;
                        void recovery.restore(draft.id).then((restored) => {
                          form.reset({ ...restored.form_values,
                            agent_user_id: adminSession.user.id, agent_name: adminSession.user.name,
                            agent_email: adminSession.user.email } as PropertyFormInput);
                          media.handleFilesChange([]);
                          media.handleCoverChange('');
                          setMissingMedia(restored.media_manifest);
                          setRestoredCover(restored.cover_file_name);
                          setSubmitError(null);
                          setValidationError(null);
                          setUncertainSubmit(restored.last_error?.phase === 'submit');
                        }).catch(() => setSubmitError('No se pudo abrir el borrador.'));
                      }}>Abrir</button>
                    <button type="button" className="text-xs text-slate-500 hover:text-red-300"
                      onClick={() => {
                        if (!window.confirm('¿Descartar este borrador?')) return;
                        void recovery.discard(draft.id).catch(() => setSubmitError('No se pudo descartar el borrador.'));
                      }}>Descartar</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {recovery.saveError && <AlertInline variant="warning" title="Borrador no guardado">{recovery.saveError}</AlertInline>}
          {recovery.currentDraft && !recovery.saveError && (
            <p className="text-xs text-slate-500" role="status">
              {recovery.isSaving ? 'Guardando borrador…' : 'Borrador guardado'}
            </p>
          )}
          {missingMedia.length > 0 && (
            <AlertInline variant="warning" title="Archivos pendientes">
              Volvé a seleccionar {missingMedia.map((file) => file.name).join(', ')} antes de enviar.
            </AlertInline>
          )}
          {recovery.currentDraft?.last_error?.phase === 'submit' && (
            <AlertInline variant="warning" title="Envío anterior sin completar">
              {recovery.currentDraft.last_error.message}
              {recovery.currentDraft.last_error.submission_id &&
                ` · ID: ${recovery.currentDraft.last_error.submission_id}`}
            </AlertInline>
          )}
          {/* Global errors */}
          {submitError && (
            <AlertInline variant="error" title="Error al enviar">
              {submitError}
            </AlertInline>
          )}

          {validationError && errorCount > 0 && isSubmitted && !isLoading && (
            <AlertInline variant="warning" title="Hay campos incompletos">
              {validationError}
            </AlertInline>
          )}

          <BasicInfoSection form={form} />
          <LocationSection form={form} />
          <DistributionSection form={form} />
          <FeaturesSection form={form} />
          <AdditionalDetailsSection form={form} />
          <MediaUploadSection
            files={media.files}
            coverFileName={media.coverFileName}
            onFilesChange={(entries) => {
              media.handleFilesChange(entries);
              const remaining = missingMedia.filter((missing) => !entries.some(({ file }) =>
                file.name === missing.name && file.size === missing.sizeBytes && file.type === missing.mimeType));
              setMissingMedia(remaining);
              if (restoredCover && entries.some(({ file }) => file.name === restoredCover)) {
                media.handleCoverChange(restoredCover);
              }
              recovery.scheduleSave(recoverySnapshot(form.getValues(), entries, remaining,
                media.coverFileName || restoredCover));
            }}
            onCoverChange={(name) => {
              media.handleCoverChange(name);
              setRestoredCover(name);
              recovery.scheduleSave(recoverySnapshot(form.getValues(), media.files, missingMedia, name));
            }}
            onValidationError={(message) => {
              void recovery.recordFailure(snapshot(), {
                phase: 'media_validation', code: 'MEDIA_VALIDATION_FAILED',
                message: message.slice(0, 500),
              }).catch(() => undefined);
            }}
            totalSizeError={media.sizeError}
            isSubmitting={submissionPhase === 'uploading'}
          />

          {/* Submit bar */}
          <div className="sticky bottom-0 glass rounded-2xl px-6 py-4 flex items-center justify-between gap-4 mt-2">
            <div className="text-xs text-slate-500">
              {media.files.length > 0 ? (
                <span>{media.files.length} archivo{media.files.length !== 1 ? 's' : ''} cargado{media.files.length !== 1 ? 's' : ''}</span>
              ) : (
                <span>Sin archivos cargados aún</span>
              )}
            </div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isLoading}
              disabled={isLoading || !media.isValid || recovery.isSaving}
              id="btn-submit-property"
            >
              {submitButtonLabel}
            </Button>
          </div>
        </form>
      </main>

    </div>
  );
}
