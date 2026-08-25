import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm, type FieldError } from 'react-hook-form';
import { AlertInline } from '../../../components/ui/AlertInline.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { ContractFieldRenderer } from './ContractFieldRenderer.tsx';
import { ContractRepeatableSection } from './ContractRepeatableSection.tsx';
import { ContractRequestError, updateContractAdminSubmission } from '../services/contractApi.ts';
import {
  buildContractDefaultValues,
  normalizeContractRoleFields,
  type ContractFormValues,
  type ContractRole,
  type ContractRoleSchemaDefinition,
  type ContractSection,
} from '../types.ts';

interface ContractAdminRoleEditFormProps {
  organizationSlug: string;
  entryId: string;
  role: ContractRole;
  schema: ContractRoleSchemaDefinition;
  values: ContractFormValues;
  userId?: string;
  onCancel: () => void;
  onSaved: () => void;
}

function fieldsOutsideSubsections(section: ContractSection) {
  const grouped = new Set(
    section.subsections?.flatMap((subsection) => subsection.fieldNames) ?? [],
  );
  return section.fields.filter((field) => !grouped.has(field.name));
}

function fieldsInSubsection(section: ContractSection, fieldNames: string[]) {
  const fieldsByName = new Map(section.fields.map((field) => [field.name, field]));
  return fieldNames.flatMap((fieldName) => {
    const field = fieldsByName.get(fieldName);
    return field ? [field] : [];
  });
}

export function ContractAdminRoleEditForm({
  organizationSlug,
  entryId,
  role,
  schema,
  values,
  userId,
  onCancel,
  onSaved,
}: ContractAdminRoleEditFormProps) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<ContractFormValues>({
    defaultValues: buildContractDefaultValues(schema, values),
  });
  const {
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
  } = form;
  const save = useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      updateContractAdminSubmission(organizationSlug, entryId, role, fields, userId),
    onSuccess: onSaved,
  });

  const invalidSubmit = () => {
    setMessage('Revisá los campos marcados antes de guardar los cambios.');
  };

  const validSubmit = (nextValues: ContractFormValues) => {
    setMessage(null);
    save.mutate(normalizeContractRoleFields(schema, nextValues));
  };

  const errorFor = (fieldName: string): FieldError | undefined =>
    errors[fieldName] as FieldError | undefined;

  return (
    <section className="mt-6 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-4" aria-labelledby={'edit-' + role + '-title'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-cyan-400">Edición administrativa</p>
          <h3 id={'edit-' + role + '-title'} className="mt-1 text-sm font-semibold text-slate-100">
            Editar formulario del {role === 'user' ? 'usuario' : 'cliente'}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Los cambios conservan la entrada y agregan un registro de auditoría.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={save.isPending}>
          Cancelar
        </Button>
      </div>

      {message && (
        <div className="mt-4">
          <AlertInline variant="error">{message}</AlertInline>
        </div>
      )}

      {save.isError && !message && (
        <div className="mt-4">
          <AlertInline variant="error">
            {save.error instanceof ContractRequestError
              ? save.error.message
              : 'No se pudieron guardar los cambios.'}
          </AlertInline>
        </div>
      )}

      <form
        className="mt-5"
        onSubmit={(event) => {
          clearErrors();
          void handleSubmit(validSubmit, invalidSubmit)(event);
        }}
        noValidate
      >
        <fieldset disabled={save.isPending} className="space-y-7 border-0 p-0">
          {schema.sections.map((section) => section.repeatable ? (
            <ContractRepeatableSection
              key={section.repeatable.name}
              section={section}
              form={form}
              entryId={entryId}
              token={null}
              onUploadPendingChange={() => undefined}
              showUploads={false}
            />
          ) : (
            <fieldset key={section.title} className="border-0 p-0">
              <legend className="mb-4 text-sm font-semibold text-slate-200">{section.title}</legend>
              {fieldsOutsideSubsections(section).length > 0 && (
                <div className="grid gap-5 sm:grid-cols-2">
                  {fieldsOutsideSubsections(section).map((field) => (
                    <ContractFieldRenderer
                      key={field.name}
                      field={field}
                      register={register}
                      error={errorFor(field.name)}
                    />
                  ))}
                </div>
              )}
              {section.subsections?.map((subsection) => (
                <fieldset key={subsection.title} className="mt-5 rounded-xl border border-white/[0.08] bg-black/10 p-4">
                  <legend className="px-1 text-sm font-semibold text-slate-200">{subsection.title}</legend>
                  <div className="mt-3 grid gap-5 sm:grid-cols-2">
                    {fieldsInSubsection(section, subsection.fieldNames).map((field) => (
                      <ContractFieldRenderer
                        key={field.name}
                        field={field}
                        register={register}
                        error={errorFor(field.name)}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </fieldset>
          ))}
        </fieldset>
        <div className="mt-6 flex justify-end gap-3 border-t border-white/[0.07] pt-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </section>
  );
}
