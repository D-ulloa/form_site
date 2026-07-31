import { useEffect, useRef, useState } from 'react';
import {
  useForm,
  type FieldError,
  type FieldErrors,
} from 'react-hook-form';
import { AlertInline } from '../../../components/ui/AlertInline.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { useContractSchema } from '../hooks/useContractSchema.ts';
import { useSubmitContract } from '../hooks/useSubmitContract.ts';
import { ContractRequestError } from '../services/contractApi.ts';
import {
  buildContractDefaultValues,
  getContractFields,
  normalizeContractFields,
  type ContractFormValues,
  type ContractReceipt as ContractReceiptData,
} from '../types.ts';
import { ContractFieldRenderer } from './ContractFieldRenderer.tsx';
import { ContractReceipt } from './ContractReceipt.tsx';

interface ContractGenerationModalProps {
  open: boolean;
  userId: string;
  onClose: () => void;
}

type ContractFlowStep = 'link' | 'form' | 'receipt';

async function copyContractLink(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Continue to the DOM fallback when clipboard permission is unavailable.
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard copy was rejected');
    }
  } finally {
    textarea.remove();
  }
}

function focusContractField(fieldName: string): void {
  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(`[name="${fieldName}"]`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  });
}

export function ContractGenerationModal({
  open,
  userId,
  onClose,
}: ContractGenerationModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initializedSchemaRef = useRef<string | null>(null);
  const submitLockRef = useRef(false);
  const submitAlertRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<ContractFlowStep>('link');
  const [copyPending, setCopyPending] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitRetriable, setSubmitRetriable] = useState(false);
  const [receipt, setReceipt] = useState<ContractReceiptData | null>(null);

  const schemaQuery = useContractSchema(open);
  const submission = useSubmitContract();
  const form = useForm<ContractFormValues>({
    defaultValues: {},
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
  });
  const {
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = form;

  const schema = schemaQuery.data;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !schema || initializedSchemaRef.current === schema.schemaId) return;
    reset(buildContractDefaultValues(schema));
    initializedSchemaRef.current = schema.schemaId;
  }, [open, reset, schema]);

  useEffect(() => {
    if (step !== 'form' || !schema) return;
    const firstField = getContractFields(schema)[0];
    if (firstField) focusContractField(firstField.name);
  }, [schema, step]);

  const closeFlow = () => {
    if (submission.isPending) return;
    setStep('link');
    setCopyPending(false);
    setCopyError(null);
    setCopied(false);
    setSubmitError(null);
    setSubmitRetriable(false);
    setReceipt(null);
    initializedSchemaRef.current = null;
    submitLockRef.current = false;
    submission.reset();
    reset({});
    onClose();
  };

  const handleCopy = async () => {
    if (!schema || copyPending) return;

    setCopyPending(true);
    setCopyError(null);
    try {
      await copyContractLink(schema.googleFormLink);
      setCopied(true);
      setStep('form');
    } catch {
      setCopyError(
        'No se pudo copiar el enlace. Permití el acceso al portapapeles e intentá nuevamente.',
      );
    } finally {
      setCopyPending(false);
    }
  };

  const handleInvalidSubmit = (fieldErrors: FieldErrors<ContractFormValues>) => {
    setSubmitRetriable(false);
    setSubmitError('Revisá los campos marcados antes de enviar el contrato.');
    const firstFieldName = Object.keys(fieldErrors)[0];
    if (firstFieldName) focusContractField(firstFieldName);
  };

  const handleValidSubmit = (values: ContractFormValues) => {
    if (!schema || submitLockRef.current || submission.isPending) return;

    submitLockRef.current = true;
    setSubmitError(null);
    setSubmitRetriable(false);
    clearErrors();

    submission.mutate(
      {
        contractType: schema.contractType,
        schemaId: schema.schemaId,
        fields: normalizeContractFields(schema, values),
        meta: { userId, origin: 'ui' },
      },
      {
        onSuccess: ({ receipt: nextReceipt }) => {
          setReceipt(nextReceipt);
          setStep('receipt');
        },
        onError: (error) => {
          const requestError =
            error instanceof ContractRequestError ? error : null;
          const knownFieldNames = new Set(
            getContractFields(schema).map((field) => field.name),
          );
          let firstServerField: string | undefined;

          requestError?.fieldErrors.forEach((fieldError) => {
            if (!fieldError.field || !knownFieldNames.has(fieldError.field)) return;
            firstServerField ??= fieldError.field;
            setError(fieldError.field, {
              type: 'server',
              message: fieldError.message,
            });
          });

          setSubmitRetriable(requestError?.retriable ?? false);
          setSubmitError(error.message || 'No se pudo enviar el contrato.');

          if (firstServerField) {
            focusContractField(firstServerField);
          } else {
            window.requestAnimationFrame(() => submitAlertRef.current?.focus());
          }
        },
        onSettled: () => {
          submitLockRef.current = false;
        },
      },
    );
  };

  if (!open) return null;

  const schemaError = schemaQuery.error instanceof Error
    ? schemaQuery.error.message
    : 'No se pudo cargar la configuración del contrato.';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="contract-modal-title"
      aria-describedby="contract-modal-description"
      className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-6xl overflow-hidden rounded-lg border border-white/[0.11] bg-[var(--bg-surface)] p-0 text-[var(--text-primary)] shadow-2xl shadow-black/50 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      onCancel={(event) => {
        event.preventDefault();
        closeFlow();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeFlow();
      }}
    >
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex items-start gap-4 border-b border-white/[0.07] px-6 py-4 sm:px-8">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="contract-modal-title" className="text-base font-semibold text-slate-100">
                Generación de contratos
              </h2>
              {step !== 'receipt' && (
                <span className="text-xs text-slate-500">
                  Paso {step === 'link' ? '1' : '2'} de 2
                </span>
              )}
              {copied && step === 'form' && (
                <span className="text-xs font-medium text-emerald-400">
                  Enlace copiado
                </span>
              )}
            </div>
            <p id="contract-modal-description" className="mt-1 text-xs text-slate-500">
              Copiá el enlace externo y completá los datos del contrato en este sitio.
            </p>
          </div>
          <button
            type="button"
            onClick={closeFlow}
            disabled={submission.isPending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Cerrar Generación de contratos"
            title="Cerrar"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {schemaQuery.isPending && (
            <div className="flex min-h-64 items-center justify-center px-6 py-12" role="status">
              <span className="text-sm text-slate-400">Cargando configuración del contrato...</span>
            </div>
          )}

          {schemaQuery.isError && (
            <div className="mx-auto flex min-h-64 max-w-xl flex-col justify-center gap-5 px-6 py-12">
              <AlertInline variant="error" title="No se pudo iniciar el flujo">
                {schemaError}
              </AlertInline>
              <div>
                <Button type="button" variant="secondary" onClick={() => schemaQuery.refetch()}>
                  Reintentar
                </Button>
              </div>
            </div>
          )}

          {schema && step === 'link' && (
            <div className="mx-auto max-w-2xl px-6 py-10 sm:px-8">
              <h3 className="text-lg font-semibold text-slate-100">Formulario externo</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Este enlace público es informativo. Copiarlo habilita el formulario interno,
                que es el único que envía datos a Google Sheets.
              </p>

              <div className="mt-7">
                <label htmlFor="contract-google-form-link" className="text-sm font-medium text-slate-300">
                  Formulario de Google
                </label>
                <div className="mt-1.5 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="contract-google-form-link"
                    value={schema.googleFormLink}
                    readOnly
                    className="field-input min-w-0 flex-1 font-mono"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleCopy}
                    loading={copyPending}
                    disabled={copyPending}
                    autoFocus
                  >
                    {copyPending ? 'Copiando...' : 'Copiar'}
                  </Button>
                </div>
              </div>

              {copyError && (
                <div className="mt-5" aria-live="assertive">
                  <AlertInline variant="error" title="No se copió el enlace">
                    {copyError}
                  </AlertInline>
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <Button type="button" variant="ghost" onClick={closeFlow}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {schema && step === 'form' && (
            <form
              id="contract-generation-form"
              onSubmit={(event) => {
                void handleSubmit(handleValidSubmit, handleInvalidSubmit)(event);
              }}
              noValidate
            >
              <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)]">
                <div className="px-6 py-8 sm:px-8">
                  {submitError && (
                    <div
                      ref={submitAlertRef}
                      tabIndex={-1}
                      className="mb-6 outline-none"
                    >
                      <AlertInline
                        variant={submitRetriable ? 'warning' : 'error'}
                        title={submitRetriable ? 'Envío temporalmente interrumpido' : 'No se pudo enviar'}
                      >
                        {submitError}
                        {submitRetriable && (
                          <span className="mt-1 block">Podés reintentar sin perder los datos ingresados.</span>
                        )}
                      </AlertInline>
                    </div>
                  )}

                  <div className="flex flex-col gap-8">
                    {schema.sections.map((section, sectionIndex) => (
                      <fieldset
                        key={section.title}
                        className="border-0 border-b border-white/[0.07] p-0 pb-8 last:border-b-0 last:pb-0"
                      >
                        <legend className="mb-5 text-sm font-semibold text-slate-200">
                          {section.title}
                        </legend>
                        <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
                          {section.fields.map((field, fieldIndex) => (
                            <ContractFieldRenderer
                              key={field.name}
                              field={field}
                              register={register}
                              error={errors[field.name] as FieldError | undefined}
                              autoFocus={sectionIndex === 0 && fieldIndex === 0}
                            />
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </div>

                <section
                  className="border-t border-white/[0.07] bg-[var(--bg-input)] px-6 py-8 lg:border-l lg:border-t-0"
                  aria-labelledby="contract-schema-json-title"
                >
                  <div className="lg:sticky lg:top-8">
                    <h3 id="contract-schema-json-title" className="text-sm font-semibold text-slate-200">
                      Esquema JSON
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Nombres de campo y reglas aplicadas a este envío.
                    </p>
                    <pre
                      className="mt-4 max-h-[55dvh] overflow-auto rounded-lg border border-white/[0.08] bg-black/20 p-4 text-xs leading-5 text-slate-300"
                      aria-label="Esquema JSON de campos del contrato"
                    >
                      {JSON.stringify({ sections: schema.sections }, null, 2)}
                    </pre>
                  </div>
                </section>
              </div>

              <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-white/[0.08] bg-[rgba(22,25,39,0.96)] px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-end sm:px-8">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeFlow}
                  disabled={submission.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={submission.isPending}
                  disabled={submission.isPending}
                >
                  {submission.isPending ? 'Enviando...' : 'Enviar'}
                </Button>
              </footer>
            </form>
          )}

          {step === 'receipt' && receipt && (
            <ContractReceipt receipt={receipt} userId={userId} onClose={closeFlow} />
          )}
        </div>
      </div>
    </dialog>
  );
}
