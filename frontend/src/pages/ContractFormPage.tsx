import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useForm, type FieldError, type FieldErrors } from 'react-hook-form';
import { useAgent } from '../app/contexts/AgentContext.tsx';
import { AlertInline } from '../components/ui/AlertInline.tsx';
import { Button } from '../components/ui/Button.tsx';
import { ContractFieldRenderer } from '../features/contracts/components/ContractFieldRenderer.tsx';
import {
  ContractRequestError,
  fetchContractRoleSchema,
  submitContractRole,
} from '../features/contracts/services/contractApi.ts';
import {
  buildContractDefaultValues,
  getContractEntryWaitingStatus,
  getContractFields,
  normalizeContractFields,
  type ContractFormValues,
  type ContractRole,
} from '../features/contracts/types.ts';

function roleFromRoute(value: string | undefined): ContractRole | null {
  return value === 'user' || value === 'client' ? value : null;
}

function displayValue(value: string | number | boolean | undefined): string {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return value === undefined || value === '' ? '—' : String(value);
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
  const form = useForm<ContractFormValues>({ defaultValues: {} });
  const { clearErrors, formState: { errors }, handleSubmit, register, reset, setError } = form;

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
    mutationFn: (fields: Record<string, string | number | boolean>) =>
      submitContractRole(entryId, role as ContractRole, token, fields, agent?.agent_user_id),
  });

  useEffect(() => {
    if (schemaQuery.data) {
      reset(buildContractDefaultValues(schemaQuery.data, schemaQuery.data.values));
    }
  }, [reset, schemaQuery.data]);

  if (!role) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-6">
        <AlertInline variant="error" title="Ruta de contrato inválida">
          El rol debe ser user o client.
        </AlertInline>
      </main>
    );
  }

  const schema = schemaQuery.data;
  const roleLabel = role === 'user' ? 'usuario' : 'cliente';

  const invalidSubmit = (fieldErrors: FieldErrors<ContractFormValues>) => {
    const first = Object.keys(fieldErrors)[0];
    if (first) document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    setSubmitMessage('Revisá los campos marcados antes de enviar.');
  };

  const validSubmit = (values: ContractFormValues) => {
    if (!schema || submission.isPending) return;
    clearErrors();
    setSubmitMessage(null);
    submission.mutate(normalizeContractFields(schema, values), {
      onSuccess: () => { void schemaQuery.refetch(); },
      onError: (error) => {
        if (error instanceof ContractRequestError) {
          const names = new Set(getContractFields(schema).map((field) => field.name));
          error.fieldErrors.forEach((fieldError) => {
            if (fieldError.field && names.has(fieldError.field)) {
              setError(fieldError.field, { type: 'server', message: fieldError.message });
            }
          });
        }
        setSubmitMessage(error.message);
      },
    });
  };

  return (
    <div className="min-h-dvh bg-[var(--bg-base)]">
      <header className="glass sticky top-0 z-10 border-b border-white/[0.07]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-cyan-400">Contract Generation</p>
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
              {schemaQuery.error.message}
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
                  Submission ID: {submission.data.submissionId}
                </AlertInline>
              </div>
            )}

            {submitMessage && (
              <div className="mb-6">
                <AlertInline variant="error" title="No se pudo enviar">{submitMessage}</AlertInline>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <section className="rounded-xl border border-white/[0.08] bg-[var(--bg-surface)] p-6 sm:p-8">
                {schema.readOnly ? (
                  <div className="space-y-8">
                    {schema.sections.map((section) => (
                      <div key={section.title}>
                        <h2 className="text-sm font-semibold text-slate-200">{section.title}</h2>
                        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                          {section.fields.map((field) => (
                            <div key={field.name} className="rounded-lg bg-black/15 p-3">
                              <dt className="text-xs text-slate-500">{field.label}</dt>
                              <dd className="mt-1 break-words text-sm text-slate-200">
                                {displayValue(schema.values[field.name])}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                ) : (
                  <form onSubmit={(event) => { void handleSubmit(validSubmit, invalidSubmit)(event); }} noValidate>
                    <div className="space-y-8">
                      {schema.sections.map((section) => (
                        <fieldset key={section.title} className="border-0 p-0">
                          <legend className="mb-5 text-sm font-semibold text-slate-200">{section.title}</legend>
                          <div className="grid gap-5 sm:grid-cols-2">
                            {section.fields.map((field) => (
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
                    </div>
                    <div className="mt-8 flex justify-end border-t border-white/[0.07] pt-5">
                      <Button type="submit" loading={submission.isPending} disabled={submission.isPending}>
                        {submission.isPending ? 'Guardando…' : 'Enviar formulario'}
                      </Button>
                    </div>
                  </form>
                )}
              </section>

              <aside className="rounded-xl border border-white/[0.08] bg-[var(--bg-input)] p-5 lg:sticky lg:top-24 lg:self-start">
                <h2 className="text-sm font-semibold text-slate-200">Esquema JSON</h2>
                <p className="mt-1 text-xs text-slate-500">Campos asignados únicamente a este rol.</p>
                <pre className="mt-4 max-h-[65dvh] overflow-auto text-xs leading-5 text-slate-400">
                  {JSON.stringify({ role: schema.role, sections: schema.sections }, null, 2)}
                </pre>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
