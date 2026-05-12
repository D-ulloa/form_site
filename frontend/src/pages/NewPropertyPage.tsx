import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgent } from '../app/contexts/AgentContext.tsx';
import { usePropertyForm } from '../features/properties/hooks/usePropertyForm.ts';
import { useMediaValidation } from '../features/properties/hooks/useMediaValidation.ts';
import { useCreatePropertySubmission } from '../features/properties/hooks/useCreatePropertySubmission.ts';
import { buildFormData } from '../features/properties/services/payloadMapper.ts';
import { BasicInfoSection } from '../features/properties/components/BasicInfoSection.tsx';
import { LocationSection } from '../features/properties/components/LocationSection.tsx';
import { DistributionSection } from '../features/properties/components/DistributionSection.tsx';
import { FeaturesSection } from '../features/properties/components/FeaturesSection.tsx';
import { AdditionalDetailsSection } from '../features/properties/components/AdditionalDetailsSection.tsx';
import { MultiSelectArraysSection } from '../features/properties/components/MultiSelectArraysSection.tsx';
import { MediaUploadSection } from '../features/properties/components/MediaUploadSection.tsx';
import { Button } from '../components/ui/Button.tsx';
import { AlertInline } from '../components/ui/AlertInline.tsx';
import { AgentModal } from '../components/ui/AgentModal.tsx';
import type { PropertyFormValues } from '../features/properties/schemas/propertySchema.ts';
import type { SubmissionResult } from '../features/properties/services/propertyApi.ts';

export function NewPropertyPage() {
  const navigate = useNavigate();
  const { agent, isConfigured } = useAgent();
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = usePropertyForm();
  const media = useMediaValidation();
  const { mutate, isPending } = useCreatePropertySubmission();

  const {
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  const errorCount = Object.keys(errors).length;
  const isLoading = isPending || isSubmitting;

  const onValidSubmit = (values: PropertyFormValues) => {
    if (!isConfigured || !agent) {
      setShowAgentModal(true);
      return;
    }
    if (!media.isValid) {
      return;
    }
    setSubmitError(null);
    const fd = buildFormData(values, media.files, media.coverFileName, agent);
    mutate(
      { formData: fd },
      {
        onSuccess: (result: SubmissionResult) => {
          navigate(`/properties/success/${result.submission_id}`, {
            state: { result },
          });
        },
        onError: (err: Error) => {
          setSubmitError(err.message ?? 'Error inesperado al enviar la propiedad.');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      },
    );
  };

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
          {isConfigured && agent && (
            <button
              type="button"
              onClick={() => setShowAgentModal(true)}
              className="text-xs text-slate-500 hover:text-indigo-400 transition-colors"
            >
              {agent.agent_name}
            </button>
          )}
        </div>
      </header>

      {/* Form */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8">
        <form
          id="property-form"
          onSubmit={handleSubmit(onValidSubmit)}
          noValidate
          className="flex flex-col gap-6"
        >
          {/* Global errors */}
          {submitError && (
            <AlertInline variant="error" title="Error al enviar">
              {submitError}
            </AlertInline>
          )}

          {errorCount > 0 && !isLoading && (
            <AlertInline variant="warning" title="Hay campos incompletos">
              Revisá los campos marcados en rojo antes de enviar.
            </AlertInline>
          )}

          <BasicInfoSection form={form} />
          <LocationSection form={form} />
          <DistributionSection form={form} />
          <FeaturesSection form={form} />
          <AdditionalDetailsSection form={form} />
          <MultiSelectArraysSection form={form} />
          <MediaUploadSection
            files={media.files}
            coverFileName={media.coverFileName}
            onFilesChange={media.handleFilesChange}
            onCoverChange={media.handleCoverChange}
            totalSizeError={media.sizeError}
            isSubmitting={isLoading}
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
              {isLoading ? 'Enviando…' : 'Enviar propiedad'}
            </Button>
          </div>
        </form>
      </main>

      <AgentModal open={showAgentModal} onClose={() => setShowAgentModal(false)} />
    </div>
  );
}
