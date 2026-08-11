import { useState } from 'react';
import { useWatch, type FieldError, type FieldErrors, type UseFormReturn } from 'react-hook-form';
import { Button } from '../../../components/ui/Button.tsx';
import {
  requestContractDniUploadUrl,
  uploadContractDniImage,
} from '../services/contractApi.ts';
import type {
  ContractDniImageReference,
  ContractDniUploadDefinition,
  ContractEvidenceFileValue,
  ContractFormValues,
  ContractSection,
} from '../types.ts';
import { isContractEvidenceFileReference } from '../types.ts';
import { ContractFieldRenderer } from './ContractFieldRenderer.tsx';
import { ContractFileReceiver } from './ContractFileReceiver.tsx';
import {
  downloadAttachment,
} from '../utils/downloadAttachment.ts';

const ACCEPTED_DNI_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];
const MAX_DNI_IMAGE_BYTES = 10 * 1024 * 1024;

interface ContractRepeatableSectionProps {
  section: ContractSection;
  form: UseFormReturn<ContractFormValues>;
  entryId: string;
  token: string | null;
  userId?: string;
  onUploadPendingChange: (key: string, pending: boolean) => void;
  showUploads?: boolean;
}

function asItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === 'object' && item !== null
      ? item as Record<string, unknown>
      : {})
    : [];
}

function buildRepeatableItem(section: ContractSection): Record<string, unknown> {
  return Object.fromEntries(section.fields.map((field) => [
    field.name,
    field.type === 'boolean' ? false : '',
  ]));
}

function nestedFieldError(
  errors: FieldErrors<ContractFormValues>,
  collection: string,
  index: number,
  fieldName: string,
): FieldError | undefined {
  let current: unknown = errors;
  for (const segment of [collection, String(index), fieldName]) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return firstNestedFieldError(current);
}

function firstNestedFieldError(value: unknown): FieldError | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if ('type' in value) return value as FieldError;

  const nestedValues = Array.isArray(value)
    ? value
    : Object.entries(value)
      .filter(([key]) => key !== 'ref')
      .map(([, nested]) => nested);
  for (const nested of nestedValues) {
    const error = firstNestedFieldError(nested);
    if (error) return error;
  }
  return undefined;
}

function fieldsOutsideSubsections(section: ContractSection) {
  const groupedNames = new Set(
    section.subsections?.flatMap((subsection) => subsection.fieldNames) ?? [],
  );
  return section.fields.filter((field) => !groupedNames.has(field.name));
}

function fieldsInSubsection(
  section: ContractSection,
  fieldNames: string[],
) {
  const fieldsByName = new Map(section.fields.map((field) => [field.name, field]));
  return fieldNames.flatMap((fieldName) => {
    const field = fieldsByName.get(fieldName);
    return field ? [field] : [];
  });
}

function isDniReference(value: unknown): value is ContractDniImageReference {
  return typeof value === 'object' && value !== null &&
    typeof (value as Record<string, unknown>).storagePath === 'string' &&
    typeof (value as Record<string, unknown>).originalName === 'string';
}

function asEvidenceFiles(value: unknown): ContractEvidenceFileValue[] {
  if (!Array.isArray(value)) return [];
  return value.filter((file): file is ContractEvidenceFileValue =>
    (typeof File !== 'undefined' && file instanceof File) ||
    isContractEvidenceFileReference(file));
}

function ContractDniUploadControl({
  definition,
  collection,
  itemIndex,
  value,
  entryId,
  token,
  userId,
  onValue,
  onPendingChange,
  error: fieldError,
}: {
  definition: ContractDniUploadDefinition;
  collection: 'inquilinos' | 'garantes';
  itemIndex: number;
  value: unknown;
  entryId: string;
  token: string | null;
  userId?: string;
  onValue: (value: ContractDniImageReference | undefined) => void;
  onPendingChange: (pending: boolean) => void;
  error?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reference = isDniReference(value) ? value : undefined;
  const referenceUrl = reference?.downloadUrl ?? reference?.viewUrl;
  const inputId = `dni-${collection}-${itemIndex}-${definition.slot}`;

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!ACCEPTED_DNI_TYPES.includes(file.type)) {
      setError('Seleccioná un archivo JPG, PNG, WEBP, GIF, HEIC, HEIF o PDF.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_DNI_IMAGE_BYTES) {
      setError('El archivo debe pesar hasta 10 MB.');
      return;
    }

    setPending(true);
    onPendingChange(true);
    try {
      const presigned = await requestContractDniUploadUrl(entryId, token, {
        collection,
        itemIndex,
        slot: definition.slot,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }, userId);
      await uploadContractDniImage(file, presigned.uploadUrl);
      const storedReference: ContractDniImageReference = {
        originalName: presigned.originalName,
        mimeType: presigned.mimeType,
        sizeBytes: presigned.sizeBytes,
        storagePath: presigned.storagePath,
        storageBucket: presigned.storageBucket,
        publicPath: presigned.publicPath,
        slot: presigned.slot,
      };
      onValue(storedReference);
    } catch {
      setError('No se pudo subir la imagen del DNI. Intentá nuevamente.');
    } finally {
      setPending(false);
      onPendingChange(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-300">
        {definition.label}
      </label>
      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_DNI_TYPES.join(',')}
        disabled={pending}
        onChange={(event) => {
          void selectFile(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
        className="mt-2 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500/15 file:px-3 file:py-2 file:text-xs file:text-indigo-300 file:cursor-pointer file:transition-colors file:hover:bg-indigo-500/30 file:hover:text-indigo-200"
      />
      <p className="mt-2 text-xs text-slate-500">
        Subir DNI — {definition.slot === 'front' ? 'Frontal' : 'Dorso'} (ej. 12.345.678) · Obligatorio · JPG, PNG o PDF · Máximo 10 MB
      </p>
      <p className="mt-2 text-xs text-slate-500" role="status">
        {pending ? 'Subiendo…' : reference ? `Cargado: ${reference.originalName}` : 'Sin imagen cargada'}
      {reference && !pending && referenceUrl && (
        <a
          href={referenceUrl}
          download={reference.originalName}
          onClick={(event) => {
            event.preventDefault();
            void downloadAttachment(referenceUrl, reference.originalName);
          }}
          className="mt-1 inline-flex text-xs text-cyan-400 hover:text-cyan-300"
        >
          Descargar archivo
        </a>
      )}
      </p>
      {reference && !pending && (
        <button
          type="button"
          onClick={() => onValue(undefined)}
          className="mt-2 text-xs text-red-400 hover:text-red-300"
        >
          Eliminar imagen
        </button>
      )}
      {fieldError && <p className="mt-2 text-xs text-red-400" role="alert">{fieldError}</p>}
      {error && <p className="mt-2 text-xs text-red-400" role="alert">{error}</p>}
    </div>
  );
}

export function ContractRepeatableSection({
  section,
  form,
  entryId,
  token,
  userId,
  onUploadPendingChange,
  showUploads = true,
}: ContractRepeatableSectionProps) {
  const repeatable = section.repeatable;
  const watched = useWatch({ control: form.control, name: repeatable?.name ?? '__invalid' });
  if (!repeatable) return null;
  const items = asItems(watched);

  const updateItems = (next: Record<string, unknown>[]) => {
    form.setValue(repeatable.name, next, { shouldDirty: true, shouldValidate: false });
  };

  return (
    <fieldset className="border-0 p-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <legend className="text-sm font-semibold text-slate-200">{section.title}</legend>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => updateItems([...items, buildRepeatableItem(section)])}
        >
          {repeatable.addLabel}
        </Button>
      </div>

      <div className="space-y-5">
        {items.map((item, index) => (
          <div
            key={`${repeatable.name}-${index}`}
            className="rounded-xl border border-white/[0.09] bg-white/[0.02] p-4 sm:p-5"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-cyan-300">
                {repeatable.itemLabel} {index + 1}
              </h3>
              {items.length > repeatable.minItems && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => updateItems(items.filter((_, itemIndex) => itemIndex !== index))}
                >
                  Eliminar
                </Button>
              )}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {fieldsOutsideSubsections(section).map((field) => (
                <ContractFieldRenderer
                  key={field.name}
                  field={field}
                  name={`${repeatable.name}.${index}.${field.name}`}
                  register={form.register}
                  error={nestedFieldError(form.formState.errors, repeatable.name, index, field.name)}
                />
              ))}
            </div>
            {section.subsections && (
              <fieldset className="mt-5 rounded-xl border border-cyan-400/15 bg-cyan-500/[0.03] p-4">
                <legend className="px-1 text-sm font-semibold text-cyan-100">Garantías</legend>
                <div className="mt-1">
                  {section.subsections.map((subsection) => (
              <section
                key={subsection.title}
                className="mt-5 rounded-xl border border-white/[0.08] bg-black/10 p-4"
                aria-labelledby={`${repeatable.name}-${index}-${subsection.title.replace(/\s+/gu, '-')}`}
              >
                <h4
                  id={`${repeatable.name}-${index}-${subsection.title.replace(/\s+/gu, '-')}`}
                  className="mb-4 text-sm font-semibold text-slate-200"
                >
                  {subsection.title}
                </h4>
                <div className="grid gap-5 sm:grid-cols-2">
                  {fieldsInSubsection(section, subsection.fieldNames).map((field) => (
                    <ContractFieldRenderer
                      key={field.name}
                      field={field}
                      name={`${repeatable.name}.${index}.${field.name}`}
                      register={form.register}
                      error={nestedFieldError(
                        form.formState.errors,
                        repeatable.name,
                        index,
                        field.name,
                      )}
                    />
                  ))}
                </div>
                {showUploads && (subsection.fileReceivers ?? []).map((receiver) => {
                  const fieldPath = `${repeatable.name}.${index}.${receiver.name}`;
                  return (
                    <ContractFileReceiver
                      key={receiver.name}
                      definition={receiver}
                      files={asEvidenceFiles(item[receiver.name])}
                      error={nestedFieldError(
                        form.formState.errors,
                        repeatable.name,
                        index,
                        receiver.name,
                      )?.message?.toString()}
                      idPrefix={`${repeatable.name}-${index}`}
                      onFilesChange={(next) => {
                        form.clearErrors(`${repeatable.name}.${index}._files`);
                        form.setValue(fieldPath, next, {
                          shouldDirty: true,
                          shouldValidate: false,
                        });
                      }}
                    />
                  );
                })}
              </section>
            ))}
                </div>
              </fieldset>
            )}
            {(() => {
              const subsectionError = nestedFieldError(
                form.formState.errors,
                repeatable.name,
                index,
                '_subsections',
              );
              return subsectionError?.message ? (
                <p className="mt-4 text-sm text-red-400" role="alert">
                  {String(subsectionError.message)}
                </p>
              ) : null;
            })()}
            {(() => {
              const evidenceError = nestedFieldError(
                form.formState.errors,
                repeatable.name,
                index,
                '_files',
              );
              return evidenceError?.message ? (
                <p className="mt-4 text-sm text-red-400" role="alert">
                  {String(evidenceError.message)}
                </p>
              ) : null;
            })()}
            {showUploads && (
              <div className="mt-5 grid gap-4 border-t border-white/[0.07] pt-5 sm:grid-cols-2">
                {(section.uploads ?? []).map((upload) => {
                  const fieldPath = `${repeatable.name}.${index}.${upload.name}`;
                  return (
                    <ContractDniUploadControl
                      key={upload.name}
                      definition={upload}
                      collection={repeatable.name}
                      itemIndex={index}
                      value={item[upload.name]}
                      entryId={entryId}
                      token={token}
                      userId={userId}
                      error={nestedFieldError(
                        form.formState.errors,
                        repeatable.name,
                        index,
                        upload.name,
                      )?.message?.toString()}
                      onValue={(next) => {
                        form.clearErrors(fieldPath);
                        form.setValue(fieldPath, next, { shouldDirty: true });
                      }}
                      onPendingChange={(pending) => onUploadPendingChange(fieldPath, pending)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
