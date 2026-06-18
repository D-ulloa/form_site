import { useState, useCallback } from 'react';
import { getMediaUploadProvider } from '../services/propertyApi.ts';
import {
  MAX_MEDIA_FILES,
  MAX_SUBMISSION_PAYLOAD_BYTES,
  MAX_SUBMISSION_PAYLOAD_BYTES_DRIVE_LEGACY,
  MAX_SUBMISSION_PAYLOAD_LABEL,
  MAX_SUBMISSION_PAYLOAD_LABEL_DRIVE_LEGACY,
} from '../utils/uploadLimits.ts';
import type { FileEntry } from '../../../components/ui/FileDropzone.tsx';

export function useMediaValidation() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [coverFileName, setCoverFileName] = useState('');
  const [sizeError, setSizeError] = useState<string | undefined>();

  const isDriveLegacy = getMediaUploadProvider() === 'drive';
  const maxBytes = isDriveLegacy
    ? MAX_SUBMISSION_PAYLOAD_BYTES_DRIVE_LEGACY
    : MAX_SUBMISSION_PAYLOAD_BYTES;
  const maxLabel = isDriveLegacy
    ? MAX_SUBMISSION_PAYLOAD_LABEL_DRIVE_LEGACY
    : MAX_SUBMISSION_PAYLOAD_LABEL;

  const handleFilesChange = useCallback((entries: FileEntry[]) => {
    const total = entries.reduce((s, e) => s + e.file.size, 0);
    const errors: string[] = [];

    if (entries.length > MAX_MEDIA_FILES) {
      errors.push(`Máximo ${MAX_MEDIA_FILES} archivos por envío.`);
    }
    if (total > maxBytes) {
      errors.push(`El total de archivos supera el límite de ${maxLabel}.`);
    }

    setSizeError(errors.length > 0 ? errors.join(' | ') : undefined);
    setFiles(entries);
  }, [maxBytes, maxLabel]);

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
