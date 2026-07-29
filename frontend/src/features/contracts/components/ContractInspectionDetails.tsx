import type {
  ContractEntryInspection,
  ContractInspectionField,
  ContractInspectionMedia,
  ContractInspectionSubsection,
} from '../types.ts';

interface ContractInspectionDetailsProps {
  inspection: ContractEntryInspection;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatFieldValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return 'Valor no disponible';
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.ceil(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FieldList({ fields }: { fields: ContractInspectionField[] }) {
  if (fields.length === 0) return null;
  return (
    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div
          key={field.name}
          data-inspection-field={field.name}
          className="min-w-0 rounded-lg bg-black/15 p-3"
        >
          <dt className="text-xs text-slate-500">{field.label}</dt>
          <dd className="mt-1 break-words text-sm text-slate-200">
            {formatFieldValue(field.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SubsectionList({
  subsections,
  idPrefix,
  headingLevel = 5,
}: {
  subsections: ContractInspectionSubsection[];
  idPrefix: string;
  headingLevel?: 5 | 6;
}) {
  return subsections.map((subsection, index) => {
    const headingId = `${idPrefix}-subsection-${index}`;
    return (
      <section
        key={`${subsection.title}-${index}`}
        aria-labelledby={headingId}
        className="mt-4 rounded-lg border border-white/[0.07] p-3"
      >
        {headingLevel === 5 ? (
          <h5 id={headingId} className="text-xs font-semibold text-slate-300">
            {subsection.title}
          </h5>
        ) : (
          <h6 id={headingId} className="text-xs font-semibold text-slate-300">
            {subsection.title}
          </h6>
        )}
        <FieldList fields={subsection.fields} />
      </section>
    );
  });
}

function MediaList({ media }: { media: ContractInspectionMedia[] }) {
  if (media.length === 0) return null;
  return (
    <section className="mt-4 border-t border-white/[0.07] pt-4">
      <h6 className="text-xs font-semibold text-slate-300">Medios asociados</h6>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {media.map((file) => (
          <article
            key={`${file.fieldName}-${file.slot}`}
            data-inspection-media={file.fieldName}
            className="overflow-hidden rounded-lg border border-white/[0.08] bg-black/15"
          >
            {file.mimeType.startsWith('image/') && (
              <img
                src={file.viewUrl}
                alt={`${file.label}: ${file.originalName}`}
                className="h-28 w-full bg-black/20 object-cover"
                loading="lazy"
              />
            )}
            <div className="p-3">
              <p className="text-xs font-medium text-slate-300">{file.label}</p>
              <p className="mt-1 break-all text-xs text-slate-500">
                {file.originalName} · {formatFileSize(file.sizeBytes)}
              </p>
              <a
                href={file.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ver ${file.label}: ${file.originalName}`}
                className="mt-2 inline-flex text-xs font-medium text-cyan-400 hover:text-cyan-300"
              >
                Ver archivo original
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ContractInspectionDetails({
  inspection,
}: ContractInspectionDetailsProps) {
  return (
    <section className="mt-6 border-t border-white/[0.07] pt-5" aria-labelledby="contract-details-title">
      <h2 id="contract-details-title" className="text-base font-semibold text-slate-100">
        Detalles del contrato
      </h2>

      {!inspection.hasSubmissions || inspection.submissions.length === 0 ? (
        <p className="mt-4 rounded-lg bg-black/15 p-4 text-sm text-slate-400" role="status">
          No hay datos de formulario enviados
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {inspection.submissions.map((submission, submissionIndex) => {
            const roleLabel = submission.role === 'user'
              ? 'Formulario del usuario'
              : 'Formulario del cliente';
            const submissionId = `inspection-${submission.role}-${submissionIndex}`;
            return (
              <article
                key={submission.submissionId}
                data-inspection-role={submission.role}
                aria-labelledby={`${submissionId}-title`}
                className="rounded-xl border border-white/[0.09] bg-white/[0.02] p-4"
              >
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <h3 id={`${submissionId}-title`} className="text-sm font-semibold text-cyan-300">
                    {roleLabel}
                  </h3>
                  <time
                    dateTime={submission.submittedAt}
                    className="text-xs text-slate-500"
                  >
                    Enviado: {formatDate(submission.submittedAt)}
                  </time>
                </header>

                <div className="mt-5 space-y-5">
                  {submission.sections.map((section, sectionIndex) => {
                    const sectionId = `${submissionId}-section-${sectionIndex}`;
                    return (
                      <section
                        key={`${section.title}-${sectionIndex}`}
                        aria-labelledby={`${sectionId}-title`}
                      >
                        <h4
                          id={`${sectionId}-title`}
                          className="text-sm font-semibold text-slate-200"
                        >
                          {section.title}
                        </h4>
                        <FieldList fields={section.fields} />
                        <SubsectionList
                          subsections={section.subsections}
                          idPrefix={sectionId}
                        />

                        {section.items.length > 0 && (
                          <div className="mt-3 space-y-4">
                            {section.items.map((item) => {
                              const itemId = `${sectionId}-item-${item.index}`;
                              return (
                                <article
                                  key={`${item.index}-${item.label}`}
                                  className="rounded-xl border border-white/[0.08] p-4"
                                  aria-labelledby={`${itemId}-title`}
                                >
                                  <h5
                                    id={`${itemId}-title`}
                                    className="text-xs font-semibold text-cyan-300"
                                  >
                                    {item.label}
                                  </h5>
                                  <FieldList fields={item.fields} />
                                  <SubsectionList
                                    subsections={item.subsections}
                                    idPrefix={itemId}
                                    headingLevel={6}
                                  />
                                  <MediaList media={item.media} />
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
