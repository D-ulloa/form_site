import { useState, useCallback } from 'react';
import type { FileEntry } from '../../../components/ui/FileDropzone.tsx';

const MAX_SIZE = 1_073_741_824; // 1 GB

export function useMediaValidation() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [coverFileName, setCoverFileName] = useState('');
  const [sizeError, setSizeError] = useState<string | undefined>();

  const handleFilesChange = useCallback((entries: FileEntry[]) => {
    const total = entries.reduce((s, e) => s + e.file.size, 0);
    if (total > MAX_SIZE) {
      setSizeError('El total de archivos supera el límite de 1 GB.');
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
