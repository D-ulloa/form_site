import { useEffect, useState } from 'react';
import type { FieldErrors } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { usePropertyForm } from '../features/properties/hooks/usePropertyForm.ts';
import { useMediaValidation } from '../features/properties/hooks/useMediaValidation.ts';
import { useCreatePropertySubmission } from '../features/properties/hooks/useCreatePropertySubmission.ts';
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
import {
  fetchAdminSession,
  type AdminSession,
} from '../features/contracts/services/adminAuthApi.ts';
import type { PropertyFormInput, PropertyFormValues } from '../features/properties/schemas/propertySchema.ts';
import type { SubmissionResult } from '../features/properties/services/propertyApi.ts';
import { useOrganization } from '../app/contexts/OrganizationContext.tsx';

type SubmissionPhase = 'idle' | 'validating' | 'preparing' | 'uploading' | 'submitting';

export function NewPropertyPage() {
  const navigate = useNavigate();
  const organization = useOrganization();
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>('idle');
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });

  const form = usePropertyForm();
  const media = useMediaValidation();
  const { mutate, isPending } = useCreatePropertySubmission(organization.organization.slug);
  const { setValue } = form;

  useEffect(() => {
    let active = true;
    void fetchAdminSession()
      .then((session) => {
        if (!active) return;
        if (!session) {
          navigate('/login', { replace: true });
          return;
        }
        setAdminSession(session);
        setValue('agent_user_id', session.user.id, { shouldValidate: true, shouldDirty: false });
        setValue('agent_name', session.user.name, { shouldValidate: true, shouldDirty: false });
        setValue('agent_email', session.user.email, { shouldValidate: true, shouldDirty: false });
      })
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => { if (active) setSessionChecked(true); });
    return () => { active = false; };
  }, [navigate, setValue]);

  const {
    handleSubmit,
    formState: { errors, isSubmitted },
  } = form;

  const errorCount = Object.keys(errors).length;
  const isLoading = isPending || submissionPhase !== 'idle';
  const provider = getMediaUploadProvider();

  const submitButtonLabel = (() => {
    switch (submissionPhase) {
      case 'validating': return 'Validando…';
      case 'preparing': return 'Preparando carga…';
      case 'uploading': return `Subiendo archivos (${uploadProgress.completed}/${uploadProgress.total})…`;
      case 'submitting': return 'Enviando propiedad…';
      default: return isPending ? 'Enviando propiedad…' : 'Enviar propiedad';
    }
  })();

  const handleSubmitError = (message: string): void => {
    setSubmissionPhase('idle');
    setValidationError(null);
    setSubmitError(message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleInvalidSubmit = (submitErrors: FieldErrors<PropertyFormInput>): void => {
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
  };

  const onValidSubmit = async (values: PropertyFormValues) => {
    if (!adminSession) {
      setSubmissionPhase('idle');
      navigate('/login', { replace: true });
      return;
    }
    if (!media.isValid) {
      setSubmissionPhase('idle');
      return;
    }

    setSubmitError(null);
    setValidationError(null);

    if (provider === 'drive') {
      const fd = buildFormData(values, media.files, media.coverFileName);
      setSubmissionPhase('submitting');
      mutate(
        { mode: 'legacy', formData: fd },
        {
          onSuccess: (result: SubmissionResult) => {
            setSubmissionPhase('idle');
            navigate(`/t/${organization.organization.slug}/properties/success/${result.submission_id}`, {
              state: { result },
            });
          },
          onError: (err: Error) => {
            handleSubmitError(err.message ?? 'Error inesperado al enviar la propiedad.');
          },
        },
      );
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
      mutate(
        { mode: 'json', payload },
        {
          onSuccess: (result: SubmissionResult) => {
            setSubmissionPhase('idle');
            navigate(`/t/${organization.organization.slug}/properties/success/${result.submission_id}`, {
              state: { result },
            });
          },
          onError: (err: Error) => {
            handleSubmitError(err.message ?? 'Error inesperado al enviar la propiedad.');
          },
        },
      );
      return;
    }

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
      );

      setSubmissionPhase('uploading');
      const uploadedMedia: MediaUploadMetadata[] = [];

      for (let i = 0; i < media.files.length; i += 1) {
        const entry = media.files[i];
        const upload = presignResponse.media_uploads[i];
        if (!entry || !upload) {
          throw new Error('Error de sesión de carga: falta información de presign para uno de los archivos.');
        }

        await uploadFileToSupabase(entry.file, upload.uploadUrl, entry.file.type);
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
      mutate(
        { mode: 'json', payload },
        {
          onSuccess: (result: SubmissionResult) => {
            setSubmissionPhase('idle');
            navigate(`/t/${organization.organization.slug}/properties/success/${result.submission_id}`, {
              state: { result },
            });
          },
          onError: (err: Error) => {
            handleSubmitError(err.message ?? 'Error inesperado al enviar la propiedad.');
          },
        },
      );
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : 'No se pudo subir la media al storage temporal. Intentá nuevamente.';
      handleSubmitError(message);
    }
  };

  if (!sessionChecked || !adminSession) {
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
              handleSubmitError(error instanceof Error ? error.message : 'Error inesperado al enviar la propiedad.');
            });
          }}
          noValidate
          className="flex flex-col gap-6"
        >
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
            onFilesChange={media.handleFilesChange}
            onCoverChange={media.handleCoverChange}
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
              disabled={isLoading || !media.isValid}
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
