import { useCallback, useRef, useState, type DragEvent } from 'react';
import {
  MAX_SUBMISSION_PAYLOAD_BYTES,
  MAX_SUBMISSION_PAYLOAD_LABEL,
} from '../../features/properties/utils/uploadLimits.ts';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
]);

export interface FileEntry {
  file: File;
  previewUrl?: string; // only for images
}

interface FileDropzoneProps {
  files: FileEntry[];
  coverFileName: string;
  onFilesChange: (entries: FileEntry[]) => void;
  onCoverChange: (name: string) => void;
  totalSizeError?: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${(n / 1_073_741_824).toFixed(2)} GB`;
}

function buildEntry(file: File): FileEntry {
  const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
  return { file, previewUrl };
}

export function FileDropzone({
  files,
  coverFileName,
  onFilesChange,
  onCoverChange,
  totalSizeError,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localErrors, setLocalErrors] = useState<string[]>([]);

  const addFiles = useCallback(
    (incoming: File[]) => {
      const errs: string[] = [];
      const valid: FileEntry[] = [];
      for (const f of incoming) {
        if (!ALLOWED_MIME.has(f.type)) {
          errs.push(`${f.name}: tipo de archivo no permitido (${f.type || 'desconocido'})`);
          continue;
        }
        valid.push(buildEntry(f));
      }

      const next = [...files, ...valid];
      const total = next.reduce((s, e) => s + e.file.size, 0);
      if (total > MAX_SUBMISSION_PAYLOAD_BYTES) {
        errs.push(`El total de archivos supera el límite de ${MAX_SUBMISSION_PAYLOAD_LABEL} para esta implementación en Vercel.`);
      }

      setLocalErrors(errs);
      if (valid.length > 0) {
        onFilesChange(next);
        if (!coverFileName && next[0]?.file.type.startsWith('image/')) {
          onCoverChange(next[0].file.name);
        }
      }
    },
    [files, coverFileName, onFilesChange, onCoverChange],
  );

  const remove = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    if (files[idx].file.name === coverFileName) {
      const nextImage = next.find((e) => e.file.type.startsWith('image/'));
      onCoverChange(nextImage?.file.name ?? '');
    }
    onFilesChange(next);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const totalSize = files.reduce((s, e) => s + e.file.size, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-all duration-200 ${
          dragOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-white/[0.12] bg-[var(--bg-input)] hover:border-indigo-500/50 hover:bg-indigo-500/5'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={Array.from(ALLOWED_MIME).join(',')}
          className="sr-only"
          onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
        />
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-300">
            Arrastrá archivos o <span className="text-indigo-400">hacé click para seleccionar</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">JPG, PNG, WEBP, GIF, MP4, MOV, AVI, WEBM · Máx. {MAX_SUBMISSION_PAYLOAD_LABEL} total</p>
        </div>
      </div>

      {/* Errors */}
      {(localErrors.length > 0 || totalSizeError) && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400 space-y-0.5">
          {[...localErrors, totalSizeError].filter(Boolean).map((e, i) => (
            <p key={i}>• {e}</p>
          ))}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>{files.length} archivo{files.length !== 1 ? 's' : ''}</span>
            <span>{formatBytes(totalSize)} / {MAX_SUBMISSION_PAYLOAD_LABEL}</span>
          </div>
          {/* Progress bar total */}
          <div className="h-1 w-full rounded-full bg-white/[0.07] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all"
              style={{ width: `${Math.min((totalSize / MAX_SUBMISSION_PAYLOAD_BYTES) * 100, 100)}%` }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            {files.map((entry, idx) => {
              const isImage = entry.file.type.startsWith('image/');
              const isCover = entry.file.name === coverFileName;

              return (
                <div
                  key={`${entry.file.name}-${idx}`}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                    isCover ? 'border-indigo-500/50 bg-indigo-500/8' : 'border-white/[0.08] bg-[var(--bg-elevated)]'
                  }`}
                >
                  {/* Thumbnail or icon */}
                  {isImage && entry.previewUrl ? (
                    <img
                      src={entry.previewUrl}
                      alt={entry.file.name}
                      className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{entry.file.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(entry.file.size)}</p>
                  </div>

                  {/* Cover toggle (images only) */}
                  {isImage && (
                    <button
                      type="button"
                      onClick={() => onCoverChange(isCover ? '' : entry.file.name)}
                      title={isCover ? 'Portada actual' : 'Marcar como portada'}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                        isCover
                          ? 'border-indigo-500/50 text-indigo-400 bg-indigo-500/15'
                          : 'border-white/[0.1] text-slate-500 hover:text-indigo-400 hover:border-indigo-500/40'
                      }`}
                    >
                      {isCover ? '★ portada' : 'portada'}
                    </button>
                  )}

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    aria-label="Quitar archivo"
                    className="text-slate-600 hover:text-red-400 transition-colors ml-1"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M5.72 5.72a.75.75 0 0 1 1.06 0L8 6.94l1.22-1.22a.75.75 0 1 1 1.06 1.06L9.06 8l1.22 1.22a.75.75 0 1 1-1.06 1.06L8 9.06l-1.22 1.22a.75.75 0 0 1-1.06-1.06L6.94 8 5.72 6.78a.75.75 0 0 1 0-1.06z" />
                      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0z" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
