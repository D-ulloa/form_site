import { useState, useCallback } from 'react';
import type { FileEntry } from '../../../components/ui/FileDropzone.tsx';
import {
  MAX_SUBMISSION_PAYLOAD_BYTES,
  MAX_SUBMISSION_PAYLOAD_LABEL,
} from '../utils/uploadLimits.ts';

export function useMediaValidation() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [coverFileName, setCoverFileName] = useState('');
  const [sizeError, setSizeError] = useState<string | undefined>();

  const handleFilesChange = useCallback((entries: FileEntry[]) => {
    const total = entries.reduce((s, e) => s + e.file.size, 0);
    if (total > MAX_SUBMISSION_PAYLOAD_BYTES) {
      setSizeError(`El total de archivos supera el límite de ${MAX_SUBMISSION_PAYLOAD_LABEL} para esta implementación en Vercel.`);
    } else {
      setSizeError(undefined);
    }
    setFiles(entries);
  }, []);

  const handleCoverChange = useCallback((name: string) => {
    setCoverFileName(name);
  }, []);

  const isValid = !sizeError;

  return {
    files,
    coverFileName,
    sizeError,
    isValid,
    handleFilesChange,
    handleCoverChange,
  };
}
