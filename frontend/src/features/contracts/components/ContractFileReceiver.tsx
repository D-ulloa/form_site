import { useEffect, useId, useState } from 'react';
import type {
  ContractEvidenceFileValue,
  ContractFileReceiverDefinition,
} from '../types.ts';

interface ContractFileReceiverProps {
  definition: ContractFileReceiverDefinition;
  files: ContractEvidenceFileValue[];
  onFilesChange: (files: ContractEvidenceFileValue[]) => void;
  error?: string;
  idPrefix?: string;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isBrowserFile(file: ContractEvidenceFileValue): file is File {
  return typeof File !== 'undefined' && file instanceof File;
}

function fileName(file: ContractEvidenceFileValue): string {
  return isBrowserFile(file) ? file.name : file.filename;
}

function fileMimeType(file: ContractEvidenceFileValue): string {
  return isBrowserFile(file) ? file.type : file.mimeType;
}

function filenameKey(file: ContractEvidenceFileValue, index: number): string {
  const name = fileName(file);
  return isBrowserFile(file)
    ? `${name}-${file.size}-${file.lastModified}-${index}`
    : `${file.storagePath}-${index}`;
}

function ContractFilePreview({ file }: { file: ContractEvidenceFileValue }) {
  const [url] = useState(() =>
    isBrowserFile(file) &&
    file.type.startsWith('image/') &&
    typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(file)
      : undefined);

  useEffect(() => () => {
    if (url && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
  }, [url]);

  const name = fileName(file);
  if (url) {
    return (
      <img
        src={url}
        alt={`Vista previa de ${name}`}
        className="h-10 w-10 shrink-0 rounded-md object-cover"
      />
    );
  }

  const indicator = fileMimeType(file) === 'application/pdf' ? 'PDF' : 'IMG';
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-[0.65rem] font-bold text-red-300"
      aria-label={`Archivo ${indicator}: ${name}`}
    >
      {indicator}
    </div>
  );
}

export function ContractFileReceiver({
  definition,
  files,
  onFilesChange,
  error,
  idPrefix,
}: ContractFileReceiverProps) {
  const generatedId = useId();
  const inputId = idPrefix
    ? `${idPrefix}-${definition.name}`
    : `contract-file-${generatedId.replace(/:/gu, '')}`;
  const helpId = `${inputId}-help`;
  const extraFormatsId = `${inputId}-extra-formats`;
  const errorId = `${inputId}-error`;
  const [localErrors, setLocalErrors] = useState<string[]>([]);

  const addFiles = (incoming: File[]) => {
    const nextErrors: string[] = [];
    const accepted: File[] = [];

    incoming.forEach((file) => {
      if (!definition.acceptedMimeTypes.includes(file.type)) {
        nextErrors.push(`${file.name}: tipo de archivo no permitido.`);
        return;
      }
      if (file.size <= 0 || file.size > definition.maxSizeBytes) {
        nextErrors.push(
          `${file.name}: el archivo debe pesar hasta ${formatBytes(definition.maxSizeBytes)}.`,
        );
        return;
      }
      accepted.push(file);
    });

    if (files.length + accepted.length > definition.maxFiles) {
      nextErrors.push(`Podés seleccionar hasta ${definition.maxFiles} archivos.`);
      setLocalErrors(nextErrors);
      return;
    }

    setLocalErrors(nextErrors);
    if (accepted.length > 0) onFilesChange([...files, ...accepted]);
  };

  const visibleErrors = [
    ...localErrors,
    ...(error && !localErrors.includes(error) ? [error] : []),
  ];

  return (
    <div className="mt-5 rounded-lg border border-white/[0.08] bg-black/10 p-3">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-300">
        {definition.label}
      </label>
      <p id={helpId} className="mt-1 text-xs text-slate-500">
        Hasta 2 archivos — PDF, JPG, PNG, GIF, WEBP
      </p>
      <p id={extraFormatsId} className="mt-0.5 text-xs text-slate-600">
        También se aceptan archivos BMP y TIFF.
      </p>
      <input
        id={inputId}
        name={inputId}
        type="file"
        multiple
        accept={definition.acceptedMimeTypes.join(',')}
        aria-describedby={[
          helpId,
          extraFormatsId,
          visibleErrors.length > 0 ? errorId : undefined,
        ].filter(Boolean).join(' ')}
        aria-invalid={visibleErrors.length > 0 || undefined}
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.currentTarget.value = '';
        }}
        className="mt-3 block w-full rounded-lg text-xs text-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500/15 file:px-3 file:py-2 file:text-xs file:text-indigo-300"
      />

      {visibleErrors.length > 0 && (
        <div id={errorId} className="mt-2 space-y-1 text-xs text-red-400" role="alert">
          {visibleErrors.map((message) => <p key={message}>{message}</p>)}
        </div>
      )}

      {files.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label={`Archivos de ${definition.label}`}>
          {files.map((file, index) => (
            <li
              key={filenameKey(file, index)}
              className="flex min-w-0 items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2"
            >
              <ContractFilePreview file={file} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-200">
                  {fileName(file)}
                </p>
                <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLocalErrors([]);
                  onFilesChange(files.filter((_, fileIndex) => fileIndex !== index));
                }}
                aria-label={`Eliminar ${fileName(file)}`}
                className="shrink-0 rounded px-2 py-1 text-xs text-red-400 outline-none hover:text-red-300 focus-visible:ring-2 focus-visible:ring-red-400"
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
