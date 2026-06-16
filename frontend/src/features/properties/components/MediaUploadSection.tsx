import { FileDropzone, type FileEntry } from '../../../components/ui/FileDropzone.tsx';
import { StepHeader } from '../../../components/ui/StepHeader.tsx';
import { getMediaUploadProvider } from '../services/propertyApi.ts';
import { MAX_SUBMISSION_PAYLOAD_LABEL } from '../utils/uploadLimits.ts';

interface Props {
  files: FileEntry[];
  coverFileName: string;
  onFilesChange: (entries: FileEntry[]) => void;
  onCoverChange: (name: string) => void;
  totalSizeError?: string;
  isSubmitting?: boolean;
}

export function MediaUploadSection({
  files,
  coverFileName,
  onFilesChange,
  onCoverChange,
  totalSizeError,
  isSubmitting,
}: Props) {
  const provider = getMediaUploadProvider();

  const subtitle =
    provider === 'drive'
      ? 'Imágenes y videos de la propiedad (máx. 3.8 MB total)'
      : `Imágenes y videos de la propiedad (máx. ${MAX_SUBMISSION_PAYLOAD_LABEL} total)`;

  return (
    <section id="section-media" className="surface rounded-2xl p-6 animate-fade-in-up delay-500">
      <StepHeader step={7} title="Archivos multimedia" subtitle={subtitle} />

      {isSubmitting && (
        <div className="mb-4 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 flex items-center gap-3">
          <svg className="animate-spin w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-indigo-300">Subiendo archivos…</p>
        </div>
      )}

      <FileDropzone
        files={files}
        coverFileName={coverFileName}
        onFilesChange={onFilesChange}
        onCoverChange={onCoverChange}
        totalSizeError={totalSizeError}
      />
    </section>
  );
}
