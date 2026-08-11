import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useForm, useWatch, type FieldError, type FieldErrors } from 'react-hook-form';
import { AlertInline } from '../components/ui/AlertInline.tsx';
import { Button } from '../components/ui/Button.tsx';
import { ContractFieldRenderer } from '../features/contracts/components/ContractFieldRenderer.tsx';
import { ContractRepeatableSection } from '../features/contracts/components/ContractRepeatableSection.tsx';
import {
  ContractRequestError,
  fetchContractRoleSchema,
  requestContractEvidenceUploadUrls,
  submitContractRole,
  uploadContractEvidenceFile,
} from '../features/contracts/services/contractApi.ts';
import {
  buildContractDefaultValues,
  getContractFileReceivers,
  getMissingContractEvidence,
  getMissingContractSubsections,
  isContractEvidenceFileReference,
  normalizeContractRoleFields,
  type ContractDniImageReference,
  type ContractEvidenceUploadDescriptor,
  type ContractFileReceiverDefinition,
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

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
function attachmentUrl(value: { viewUrl?: string; downloadUrl?: string }): string | undefined {
  return value.downloadUrl ?? value.viewUrl;
}

function ReadOnlyEvidenceFiles({
  receiver,
  values,
}: {
  receiver: ContractFileReceiverDefinition;
  values: Record<string, unknown>;
}) {
  const rawFiles = values[receiver.name];
  const files = Array.isArray(rawFiles)
    ? rawFiles.filter(isContractEvidenceFileReference)
    : [];
  if (files.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-slate-400">{receiver.label}</p>
      <ul className="mt-2 space-y-2">
        {files.map((file, index) => {
          const href = attachmentUrl(file);
          return (
            <li
              key={`${file.storagePath}-${index}`}
              className="rounded-lg bg-black/15 p-3 text-xs text-slate-300"
            >
              <p className="break-all">{file.filename}</p>
              <p className="mt-1 text-xs text-slate-500">{file.mimeType}</p>
              <p className="mt-1 text-xs text-slate-500">{formatFileSize(file.size)}</p>
              {href && (
                <a
                  href={href}
                  download={file.filename}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex text-cyan-400 hover:text-cyan-300"
                >
                  Descargar archivo
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReadOnlyDniFiles({
  section,
  values,
}: {
  section: ContractSection;
  values: Record<string, unknown>;
}) {
  const files = (section.uploads ?? []).flatMap((definition) => {
    const raw = values[definition.name];
    if (typeof raw !== "object" || raw === null) return [];
    const reference = raw as Partial<ContractDniImageReference>;
    if (typeof reference.originalName !== "string") return [];
    return [{ definition, reference }];
  });
  if (files.length === 0) return null;

  return (
    <div className="mt-5 border-t border-white/[0.07] pt-4">
      <p className="text-xs font-medium text-slate-400">Documentos adjuntos</p>
      <ul className="mt-2 space-y-2">
        {files.map(({ definition, reference }) => {
          const href = attachmentUrl(reference);
          return (
            <li key={definition.name} className="rounded-lg bg-black/15 p-3 text-xs text-slate-300">
              <p className="break-all">{definition.label}: {reference.originalName}</p>
              {typeof reference.mimeType === "string" && typeof reference.sizeBytes === "number" && (
                <p className="mt-1 text-slate-500">{reference.mimeType} · {formatFileSize(reference.sizeBytes)}</p>
              )}
              {href && (
                <a
                  href={href}
                  download={reference.originalName}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex text-cyan-400 hover:text-cyan-300"
                >
                  Descargar archivo
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
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

interface PendingEvidenceUpload {
  itemIndex: number;
  receiverName: ContractFileReceiverDefinition['name'];
  file: File;
}

function collectPendingEvidenceUploads(
  schema: { sections: ContractSection[] },
  values: ContractFormValues,
): PendingEvidenceUpload[] {
  const pending: PendingEvidenceUpload[] = [];
  const guarantorSection = schema.sections.find(
    (section) => section.repeatable?.name === 'garantes',
  );
  if (!guarantorSection) return pending;
  const items = Array.isArray(values.garantes) ? values.garantes : [];

  items.forEach((item, itemIndex) => {
    if (typeof item !== 'object' || item === null) return;
    const itemValues = item as Record<string, unknown>;
    getContractFileReceivers(guarantorSection).forEach((receiver) => {
      const files = itemValues[receiver.name];
      if (!Array.isArray(files)) return;
      files.forEach((file) => {
        if (typeof File !== 'undefined' && file instanceof File) {
          pending.push({ itemIndex, receiverName: receiver.name, file });
        }
      });
    });
  });

  return pending;
}

async function replaceFilesWithEvidenceReferences(
  schema: { sections: ContractSection[] },
  values: ContractFormValues,
  entryId: string,
  token: string | null,
  userId?: string,
): Promise<ContractFormValues> {
  const pending = collectPendingEvidenceUploads(schema, values);
  if (pending.length === 0) return values;

  const descriptors: ContractEvidenceUploadDescriptor[] = pending.map((upload) => ({
    collection: 'garantes',
    itemIndex: upload.itemIndex,
    field: upload.receiverName,
    filename: upload.file.name,
    mimeType: upload.file.type,
    size: upload.file.size,
  }));
  const presigned = await requestContractEvidenceUploadUrls(
    entryId,
    token,
    descriptors,
    userId,
  );
  if (presigned.length !== pending.length) {
    throw new Error('El servidor no devolvió todas las referencias de carga.');
  }

  await Promise.all(pending.map((upload, index) => {
    const target = presigned[index];
    if (!target) throw new Error('Falta una referencia de carga.');
    return uploadContractEvidenceFile(upload.file, target.uploadUrl);
  }));

  const nextItems = (Array.isArray(values.garantes) ? values.garantes : []).map((item) =>
    typeof item === 'object' && item !== null
      ? { ...item as Record<string, unknown> }
      : {});

  pending.forEach((upload, index) => {
    const target = presigned[index];
    const item = nextItems[upload.itemIndex];
    if (!target || !item) throw new Error('No se pudo asociar el archivo cargado.');
    const current = item[upload.receiverName];
    const references = Array.isArray(current)
      ? current.filter(isContractEvidenceFileReference)
      : [];
    references.push({
      filename: target.filename,
      mimeType: target.mimeType,
      size: target.size,
      storagePath: target.storagePath,
      storageBucket: target.storageBucket,
    });
    item[upload.receiverName] = references;
  });

  return { ...values, garantes: nextItems };
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
            {(subsection.fileReceivers ?? []).map((receiver) => (
              <ReadOnlyEvidenceFiles
                key={receiver.name}
                receiver={receiver}
                values={values}
              />
            ))}
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
              {section.subsections && (
                <fieldset className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-500/[0.03] p-3">
                  <legend className="px-1 text-xs font-semibold text-cyan-100">Garantías</legend>
                  <div className="mt-1">
                    {section.subsections.map((subsection) => (
                <section
                  key={subsection.title}
                  className="mt-4 rounded-lg border border-white/[0.07] p-3"
                  aria-labelledby={
                    `${section.repeatable?.name}-${index}-${subsection.title}`
                      .replace(/\s+/gu, '-')
                  }
                >
                  <h4
                    id={
                      `${section.repeatable?.name}-${index}-${subsection.title}`
                        .replace(/\s+/gu, '-')
                    }
                    className="text-xs font-semibold text-slate-300"
                  >
                    {subsection.title}
                  </h4>
                  <ReadOnlyFieldList
                    fields={fieldsInSubsection(section, subsection.fieldNames)}
                    values={itemValues}
                  />
                  {(subsection.fileReceivers ?? []).map((receiver) => (
                    <ReadOnlyEvidenceFiles
                      key={receiver.name}
                      receiver={receiver}
                      values={itemValues}
                    />
                  ))}
                </section>
              ))}
                  </div>
                </fieldset>
              )}
              <ReadOnlyDniFiles section={section} values={itemValues} />
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
  const [reconciledMessage, setReconciledMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<Set<string>>(() => new Set());
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const initializedFormKey = useRef<string | null>(null);
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
      undefined,
    ),
    enabled: Boolean(entryId && role),
    retry: false,
  });
  const submission = useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      submitContractRole(entryId, role as ContractRole, token, fields, undefined),
  });

  useEffect(() => {
    if (schemaQuery.data) {
      const submittedAt = role === "user" ? schemaQuery.data.entry.userSubmittedAt : schemaQuery.data.entry.clientSubmittedAt;
      const formKey = `${entryId}:${role ?? ""}:${token ?? ""}:${schemaQuery.data.schemaId}:${submittedAt ?? ""}`;
      if (initializedFormKey.current !== formKey || schemaQuery.data.readOnly) {
        reset(buildContractDefaultValues(schemaQuery.data, schemaQuery.data.values));
        initializedFormKey.current = formKey;
      }
    }
  }, [entryId, reset, role, schemaQuery.data, token]);

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
  const formLocked = submission.isPending || evidenceUploading;
  const formReadOnly = Boolean(schema?.readOnly && !isEditing);

  const editSubmittedForm = () => {
    setIsEditing(true);
    setSubmitMessage(null);
    setReconciledMessage(null);
  };

  const invalidSubmit = (fieldErrors: FieldErrors<ContractFormValues>) => {
    const first = Object.keys(fieldErrors)[0];
    if (first) document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    setSubmitMessage('Revisá los campos marcados antes de guardar.');
  };

  const validSubmit = async (values: ContractFormValues) => {
    if (!schema || submission.isPending || evidenceUploading) return;
    clearErrors();
    if (pendingUploads.size > 0) {
      setSubmitMessage('Esperá a que terminen de subir las imágenes del DNI.');
      return;
    }
    const missingDniUploads: Array<{
      collection: string;
      itemIndex: number;
      uploadName: string;
      message: string;
    }> = [];
    schema.sections.forEach((section) => {
      if (!section.repeatable) return;
      const items = Array.isArray(values[section.repeatable.name])
        ? values[section.repeatable.name] as unknown[]
        : [];
      items.forEach((item, itemIndex) => {
        const itemValues = typeof item === 'object' && item !== null
          ? item as Record<string, unknown>
          : {};
        (section.uploads ?? []).filter((upload) => upload.required).forEach((upload) => {
          if (itemValues[upload.name] !== undefined && itemValues[upload.name] !== null) return;
          missingDniUploads.push({
            collection: section.repeatable!.name,
            itemIndex,
            uploadName: upload.name,
            message: upload.slot === 'front'
              ? 'Se requiere la imagen frontal del DNI.'
              : 'Se requiere la imagen del dorso del DNI.',
          });
        });
      });
    });
    if (missingDniUploads.length > 0) {
      missingDniUploads.forEach((missing) => {
        setError(`${missing.collection}.${missing.itemIndex}.${missing.uploadName}`, {
          type: 'required',
          message: missing.message,
        });
      });
      const firstMissing = missingDniUploads[0];
      if (firstMissing) {
        document.getElementById(
          `dni-${firstMissing.collection}-${firstMissing.itemIndex}-${firstMissing.uploadName.includes('back') ? 'back' : 'front'}`,
        )?.focus();
      }
      setSubmitMessage('Completá las imágenes Frontal y Dorso del DNI antes de guardar.');
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
    const missingEvidence = getMissingContractEvidence(schema, values);
    if (missingEvidence.length > 0) {
      missingEvidence.forEach(({ collection, itemIndex }) => {
        setError(`${collection}.${itemIndex}._files`, {
          type: 'required',
          message:
            'Adjuntá al menos un archivo en Recibo de sueldo o Garantía propietaria.',
        });
      });
      const firstMissing = missingEvidence[0];
      if (firstMissing) {
        document.getElementById(
          `${firstMissing.collection}-${firstMissing.itemIndex}-recibo_sueldo_files`,
        )?.focus();
      }
      setSubmitMessage(
        'Cada garante debe adjuntar al menos un archivo en Recibo de sueldo o Garantía propietaria.',
      );
      return;
    }
    setSubmitMessage(null);
    setReconciledMessage(null);
    setEvidenceUploading(true);
    let finalSubmitAttempted = false;
    try {
      const uploadedValues = await replaceFilesWithEvidenceReferences(
        schema,
        values,
        entryId,
        token,
        undefined,
      );
      if (uploadedValues !== values && uploadedValues.garantes !== undefined) {
        setValue('garantes', uploadedValues.garantes, {
          shouldDirty: true,
          shouldValidate: false,
        });
      }
      finalSubmitAttempted = true;
      await submission.mutateAsync(normalizeContractRoleFields(schema, uploadedValues));
      setIsEditing(false);
      void schemaQuery.refetch();
    } catch (error) {
      if (finalSubmitAttempted) {
        const reconciliation = await schemaQuery.refetch();
        if (reconciliation.data?.readOnly) {
          setSubmitMessage(null);
          setReconciledMessage(
            'El formulario ya había sido recibido y se actualizó a modo de solo lectura.',
          );
          return;
        }
      }
      if (error instanceof ContractRequestError) {
        error.fieldErrors.forEach((fieldError) => {
          if (fieldError.field) {
            setError(fieldError.field, { type: 'server', message: fieldError.message });
          }
        });
      }
      setSubmitMessage(
        error instanceof ContractRequestError && error.fieldErrors.length > 0
          ? 'Revisá los campos marcados e intentá guardar nuevamente.'
          : finalSubmitAttempted
            ? 'No se pudo confirmar el guardado. Verificamos el estado y podés intentar nuevamente.'
            : 'No se pudieron subir los archivos. Intentá guardar nuevamente.',
      );
    } finally {
      setEvidenceUploading(false);
    }
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
          {role !== "client" && (
            <nav aria-label="Navegación del formulario" className="flex items-center gap-4">
              <Link to="/" className="text-sm text-slate-400 hover:text-white">Inicio</Link>
              <Link to="/contracts/admin" className="text-sm text-slate-400 hover:text-white">Contratos</Link>
            </nav>
          )}
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

            {submission.data && (
              <div className="mb-6">
                <AlertInline variant="success" title="Formulario guardado">
                  <p>Identificador del envío: {submission.data.submissionId}</p>
                  <p className="mt-2 text-sm text-emerald-200">
                    Podés revisar y corregir los datos; guardá nuevamente cuando termines.
                  </p>
                  {!formReadOnly && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={editSubmittedForm}
                      className="mt-3"
                    >
                      Editar
                    </Button>
                  )}
                </AlertInline>
              </div>
            )}

            {reconciledMessage && (
              <div className="mb-6">
                <AlertInline variant="success" title="Formulario guardado">
                  {reconciledMessage}
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
                {formReadOnly ? (
                  <div className="space-y-8">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-black/10 p-4">
                      <p className="text-sm text-slate-400">
                        Este formulario está guardado en modo de solo lectura.
                      </p>
                      <Button type="button" variant="secondary" onClick={editSubmittedForm}>
                        Editar
                      </Button>
                    </div>
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
                    <fieldset
                      disabled={formLocked}
                      aria-busy={formLocked}
                      className="border-0 p-0"
                    >
                      <legend className="sr-only">Datos del formulario</legend>
                      <div className="space-y-8">
                        {schema.sections.map((section) => section.repeatable ? (
                          <ContractRepeatableSection
                            key={section.repeatable.name}
                            section={section}
                            form={form}
                            entryId={entryId}
                            token={token}
                            userId={undefined}
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
                    </fieldset>
                    <div className="mt-8 flex justify-end border-t border-white/[0.07] pt-5">
                      <Button
                        type="submit"
                        loading={formLocked}
                        disabled={
                          formLocked ||
                          pendingUploads.size > 0
                        }
                      >
                        {formLocked ? 'Guardando…' : 'Guardar'}
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
