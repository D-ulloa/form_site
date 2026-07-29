import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useForm, useWatch, type FieldError, type FieldErrors } from 'react-hook-form';
import { useAgent } from '../app/contexts/AgentContext.tsx';
import { AlertInline } from '../components/ui/AlertInline.tsx';
import { Button } from '../components/ui/Button.tsx';
import { ContractFieldRenderer } from '../features/contracts/components/ContractFieldRenderer.tsx';
import { ContractRepeatableSection } from '../features/contracts/components/ContractRepeatableSection.tsx';
import {
  ContractRequestError,
  fetchContractRoleSchema,
  submitContractRole,
} from '../features/contracts/services/contractApi.ts';
import {
  buildContractDefaultValues,
  getContractEntryWaitingStatus,
  getMissingContractSubsections,
  normalizeContractRoleFields,
  type ContractFormValues,
  type ContractSection,
  type ContractRole,
} from '../features/contracts/types.ts';
import {
  computeFormattedStart,
  computeFormattedUpdate,
} from '../features/contracts/utils/contractComputedDates.ts';

function roleFromRoute(value: string | undefined): ContractRole | null {
  return value === 'user' || value === 'client' ? value : null;
}

function displayValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'object' && value !== null && 'originalName' in value) {
    return `Imagen: ${String((value as Record<string, unknown>).originalName)}`;
  }
  return value === undefined || value === '' ? '—' : String(value);
}

function fieldsOutsideSubsections(section: ContractSection) {
  const groupedNames = new Set(
    section.subsections?.flatMap((subsection) => subsection.fieldNames) ?? [],
  );
  return section.fields.filter((field) => !groupedNames.has(field.name));
}

function fieldsInSubsection(section: ContractSection, fieldNames: string[]) {
  const fieldsByName = new Map(section.fields.map((field) => [field.name, field]));
  return fieldNames.flatMap((fieldName) => {
    const field = fieldsByName.get(fieldName);
    return field ? [field] : [];
  });
}

function ReadOnlyFieldList({
  fields,
  values,
}: {
  fields: { name: string; label: string }[];
  values: Record<string, unknown>;
}) {
  return (
    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.name} className="rounded-lg bg-black/15 p-3">
          <dt className="text-xs text-slate-500">{field.label}</dt>
          <dd className="mt-1 break-words text-sm text-slate-200">
            {displayValue(values[field.name])}
          </dd>
        </div>
      ))}
    </dl>
  );
}


function ReadOnlyContractSection({
  section,
  values,
}: {
  section: ContractSection;
  values: ContractFormValues;
}) {
  if (!section.repeatable) {
    const ungroupedFields = fieldsOutsideSubsections(section);
    return (
      <div>
        <h2 className="text-sm font-semibold text-slate-200">{section.title}</h2>
        {ungroupedFields.length > 0 && (
          <ReadOnlyFieldList fields={ungroupedFields} values={values} />
        )}
        {section.subsections?.map((subsection) => (
          <section
            key={subsection.title}
            className="mt-5 rounded-xl border border-white/[0.08] bg-black/10 p-4"
            aria-labelledby={`${section.title}-${subsection.title}`.replace(/\s+/gu, '-')}
          >
            <h3
              id={`${section.title}-${subsection.title}`.replace(/\s+/gu, '-')}
              className="text-sm font-semibold text-slate-200"
            >
              {subsection.title}
            </h3>
            <ReadOnlyFieldList
              fields={fieldsInSubsection(section, subsection.fieldNames)}
              values={values}
            />
          </section>
        ))}
      </div>
    );
  }

  const rawItems = values[section.repeatable.name];
  const items = Array.isArray(rawItems) ? rawItems : [];
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-200">{section.title}</h2>
      <div className="mt-4 space-y-4">
        {items.map((item, index) => {
          const itemValues = typeof item === 'object' && item !== null
            ? item as Record<string, unknown>
            : {};
          return (
            <div key={index} className="rounded-xl border border-white/[0.08] p-4">
              <h3 className="text-xs font-medium text-cyan-300">
                {section.repeatable?.itemLabel} {index + 1}
              </h3>
              <ReadOnlyFieldList
                fields={fieldsOutsideSubsections(section)}
                values={itemValues}
              />
              {section.subsections?.map((subsection) => (
                <section
                  key={subsection.title}
                  className="mt-4 rounded-lg border border-white/[0.07] p-3"
                >
                  <h4 className="text-xs font-semibold text-slate-300">
                    {subsection.title}
                  </h4>
                  <ReadOnlyFieldList
                    fields={fieldsInSubsection(section, subsection.fieldNames)}
                    values={itemValues}
                  />
                </section>
              ))}
              {(section.uploads?.length ?? 0) > 0 && (
                <ReadOnlyFieldList fields={section.uploads ?? []} values={itemValues} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
export function ContractFormPage() {
  const params = useParams<{ entryId: string; role: string }>();
  const location = useLocation();
  const { agent } = useAgent();
  const role = roleFromRoute(params.role);
  const entryId = params.entryId ?? '';
  const token = useMemo(
    () => {
      const queryToken = new URLSearchParams(location.search).get('token');
      if (queryToken) return queryToken;
      return sessionStorage.getItem(`contract-token:${entryId}:${role ?? ''}`);
    },
    [entryId, location.search, role],
  );
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Set<string>>(() => new Set());
  const form = useForm<ContractFormValues>({ defaultValues: {} });
  const {
    clearErrors,
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
  } = form;
  const contractStartDate = useWatch({ control, name: 'contract_start_date' });
  const contractUpdate = useWatch({ control, name: 'contract_update' });

  useEffect(() => {
    if (!token || !new URLSearchParams(location.search).has('token')) return;
    sessionStorage.setItem(`contract-token:${entryId}:${role ?? ''}`, token);
    window.history.replaceState(
      window.history.state,
      '',
      `${location.pathname}${location.hash}`,
    );
  }, [entryId, location.hash, location.pathname, location.search, role, token]);

  const schemaQuery = useQuery({
    queryKey: ['contract-entry-schema', entryId, role, token],
    queryFn: () => fetchContractRoleSchema(
      entryId,
      role as ContractRole,
      token,
      agent?.agent_user_id,
    ),
    enabled: Boolean(entryId && role),
    retry: false,
  });
  const submission = useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      submitContractRole(entryId, role as ContractRole, token, fields, agent?.agent_user_id),
  });

  useEffect(() => {
    if (schemaQuery.data) {
      reset(buildContractDefaultValues(schemaQuery.data, schemaQuery.data.values));
    }
  }, [reset, schemaQuery.data]);

  useEffect(() => {
    const formattedStart = computeFormattedStart(contractStartDate);
    setValue('contract_formatted_start', formattedStart, { shouldValidate: false });
    setValue(
      'contract_formatted_update',
      computeFormattedUpdate(formattedStart, contractUpdate),
      { shouldValidate: false },
    );
  }, [contractStartDate, contractUpdate, setValue]);

  const setUploadPending = (key: string, pending: boolean) => setPendingUploads((current) => {
    const next = new Set(current);
    if (pending) next.add(key);
    else next.delete(key);
    return next;
  });

  if (!role) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-6">
        <AlertInline variant="error" title="Ruta de contrato inválida">
          El enlace debe corresponder al formulario del usuario o del cliente.
        </AlertInline>
      </main>
    );
  }

  const schema = schemaQuery.data;
  const roleLabel = role === 'user' ? 'usuario' : 'cliente';

  const invalidSubmit = (fieldErrors: FieldErrors<ContractFormValues>) => {
    const first = Object.keys(fieldErrors)[0];
    if (first) document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    setSubmitMessage('Revisá los campos marcados antes de guardar.');
  };

  const validSubmit = (values: ContractFormValues) => {
    if (!schema || submission.isPending) return;
    clearErrors();
    if (pendingUploads.size > 0) {
      setSubmitMessage('Esperá a que terminen de subir las imágenes del DNI.');
      return;
    }
    const hasIncompleteDniPair = schema.sections.some((section) => {
      if (!section.repeatable || (section.uploads?.length ?? 0) !== 2) return false;
      const rawItems = values[section.repeatable.name];
      if (!Array.isArray(rawItems)) return false;
      return rawItems.some((item) => {
        if (typeof item !== 'object' || item === null) return false;
        const itemValues = item as Record<string, unknown>;
        const uploadCount = (section.uploads ?? [])
          .filter((upload) => itemValues[upload.name] !== undefined).length;
        return uploadCount === 1;
      });
    });
    if (hasIncompleteDniPair) {
      setSubmitMessage('Cada DNI debe incluir Frente DNI y Dorso DNI.');
      return;
    }
    const missingSubsections = getMissingContractSubsections(schema, values);
    if (missingSubsections.length > 0) {
      missingSubsections.forEach(({ collection, itemIndex }) => {
        setError(`${collection}.${itemIndex}._subsections`, {
          type: 'required',
          message: 'Completá al menos Recibo de sueldo o Garantía propietaria.',
        });
      });
      const firstMissing = missingSubsections[0];
      const firstSection = schema.sections.find(
        (section) => section.repeatable?.name === firstMissing?.collection,
      );
      const firstField = firstSection?.subsections?.[0]?.fieldNames[0];
      if (firstMissing && firstField) {
        document.querySelector<HTMLElement>(
          `[name="${firstMissing.collection}.${firstMissing.itemIndex}.${firstField}"]`,
        )?.focus();
      }
      setSubmitMessage(
        'Cada garante debe completar Recibo de sueldo o Garantía propietaria.',
      );
      return;
    }
    setSubmitMessage(null);
    submission.mutate(normalizeContractRoleFields(schema, values), {
      onSuccess: () => { void schemaQuery.refetch(); },
      onError: (error) => {
        if (error instanceof ContractRequestError) {
          error.fieldErrors.forEach((fieldError) => {
            if (fieldError.field) setError(fieldError.field, { type: 'server', message: fieldError.message });
          });
        }
        setSubmitMessage('Revisá los campos marcados e intentá guardar nuevamente.');
      },
    });
  };

  return (
    <div className="min-h-dvh bg-[var(--bg-base)]">
      <header className="glass sticky top-0 z-10 border-b border-white/[0.07]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-cyan-400">Generación de contratos</p>
            <h1 className="mt-1 text-lg font-semibold text-slate-100">
              Formulario del {roleLabel}
            </h1>
          </div>
          <Link to="/" className="text-sm text-slate-400 hover:text-white">Inicio</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {schemaQuery.isPending && (
          <div className="flex min-h-64 items-center justify-center text-sm text-slate-400" role="status">
            Cargando formulario seguro…
          </div>
        )}

        {schemaQuery.isError && (
          <div className="mx-auto max-w-xl">
            <AlertInline variant="error" title="No se pudo abrir el formulario">
              Verificá el enlace e intentá nuevamente.
            </AlertInline>
          </div>
        )}

        {schema && (
          <>
            <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[var(--bg-surface)] px-5 py-4">
              <div>
                <p className="font-mono text-sm text-slate-200">{schema.entry.entryId.slice(0, 8)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Estado: {getContractEntryWaitingStatus(schema.entry)}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                schema.entry.status === 'complete'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-amber-500/15 text-amber-400'
              }`}>
                {schema.readOnly ? 'Solo lectura' : 'Pendiente'}
              </span>
            </section>

            {submission.data && (
              <div className="mb-6">
                <AlertInline variant="success" title="Formulario guardado">
                  Identificador del envío: {submission.data.submissionId}
                </AlertInline>
              </div>
            )}

            {submitMessage && (
              <div className="mb-6">
                <AlertInline variant="error" title="No se pudo guardar">{submitMessage}</AlertInline>
              </div>
            )}

            <div>
              <section className="rounded-xl border border-white/[0.08] bg-[var(--bg-surface)] p-6 sm:p-8">
                {schema.readOnly ? (
                  <div className="space-y-8">
                    {schema.sections.map((section) => (
                      <ReadOnlyContractSection key={section.title} section={section} values={schema.values} />
                    ))}
                  </div>
                ) : (
                  <form
                    onSubmit={(event) => {
                      schema.sections.forEach((section) => {
                        if (section.subsections && section.repeatable) {
                          clearErrors(section.repeatable.name);
                        }
                      });
                      void handleSubmit(validSubmit, invalidSubmit)(event);
                    }}
                    noValidate
                  >
                    <div className="space-y-8">
                      {schema.sections.map((section) => section.repeatable ? (
                        <ContractRepeatableSection
                          key={section.repeatable.name}
                          section={section}
                          form={form}
                          entryId={entryId}
                          token={token}
                          userId={agent?.agent_user_id}
                          onUploadPendingChange={setUploadPending}
                        />
                      ) : (
                          <fieldset key={section.title} className="border-0 p-0">
                            <legend className="mb-5 text-sm font-semibold text-slate-200">{section.title}</legend>
                            {fieldsOutsideSubsections(section).length > 0 && (
                              <div className="grid gap-5 sm:grid-cols-2">
                                {fieldsOutsideSubsections(section).map((field) => (
                                  <ContractFieldRenderer
                                    key={field.name}
                                    field={field}
                                    register={register}
                                    error={errors[field.name] as FieldError | undefined}
                                  />
                                ))}
                              </div>
                            )}
                            {section.subsections?.map((subsection) => (
                              <fieldset
                                key={subsection.title}
                                className="mt-5 rounded-xl border border-white/[0.08] bg-black/10 p-4"
                              >
                                <legend className="px-1 text-sm font-semibold text-slate-200">
                                  {subsection.title}
                                </legend>
                                <div className="mt-3 grid gap-5 sm:grid-cols-2">
                                  {fieldsInSubsection(section, subsection.fieldNames).map((field) => (
                                    <ContractFieldRenderer
                                      key={field.name}
                                      field={field}
                                      register={register}
                                      error={errors[field.name] as FieldError | undefined}
                                    />
                                  ))}
                                </div>
                              </fieldset>
                            ))}
                          </fieldset>
                        ))}
                    </div>
                    <div className="mt-8 flex justify-end border-t border-white/[0.07] pt-5">
                      <Button type="submit" loading={submission.isPending} disabled={submission.isPending || pendingUploads.size > 0}>
                        {submission.isPending ? 'Guardando…' : 'Guardar'}
                      </Button>
                    </div>
                  </form>
                )}
              </section>

            </div>
          </>
        )}
      </main>
    </div>
  );
}
