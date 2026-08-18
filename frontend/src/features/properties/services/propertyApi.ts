import axios from 'axios';
import type { PropertySubmissionPayload, MediaUploadMetadata } from './payloadMapper.ts';

export interface SubmissionStepResults {
  drive_folder: 'ok' | 'failed' | 'skipped';
  file_upload: 'ok' | 'failed' | 'skipped';
  drive_upload: 'ok' | 'failed' | 'skipped';
  sheets: 'ok' | 'failed' | 'skipped';
  make: 'ok' | 'failed' | 'skipped';
}

export type SubmissionOutcome = 'success' | 'failure' | 'partial_failure';

export interface SubmissionResult {
  outcome: SubmissionOutcome;
  property_id: string;
  submission_id: string;
  drive_folder_url?: string;
  drive_folder_name?: string;
  upload_strategy: 'supabase' | 'drive' | 'both';
  supabase_object_count?: number;
  upload_byte_total?: number;
  steps: SubmissionStepResults;
  error?: string;
}

export interface ApiError {
  message: string;
  status: number;
  details?: string[];
}

export interface MediaUploadRequestFile {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PresignedMediaUpload {
  originalName: string;
  uploadUrl: string;
  publicPath: string;
  storagePath: string;
  storageBucket: string;
}

export interface PresignResponse {
  upload_session_id: string;
  media_uploads: PresignedMediaUpload[];
}

export type UploadClient = 'supabase' | 'drive';

const API_PREFIX = import.meta.env.DEV ? '' : '/_/backend';

export function getMediaUploadProvider(): UploadClient {
  const provider =
    typeof import.meta.env.VITE_MEDIA_UPLOAD_PROVIDER === 'string'
      ? import.meta.env.VITE_MEDIA_UPLOAD_PROVIDER.toLowerCase()
      : 'supabase';

  return provider === 'drive' ? 'drive' : 'supabase';
}

export async function requestMediaUploadUrls(
  files: MediaUploadRequestFile[],
): Promise<PresignResponse> {
  const response = await axios.post<PresignResponse>(
    `${API_PREFIX}/properties/media/presign`,
    {
      files,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    },
  );

  return response.data;
}

export async function uploadFileToSupabase(
  file: File,
  uploadUrl: string,
  mimeType: string,
): Promise<void> {
  await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
    },
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 300,
  });
}

export function buildMediaMetadataFromPresigned(
  file: File,
  presign: PresignedMediaUpload,
): MediaUploadMetadata {
  return {
    original_name: file.name,
    storage_path: presign.storagePath,
    mime_type: file.type,
    size_bytes: file.size,
    storage_bucket: presign.storageBucket,
    public_path: presign.publicPath,
  };
}

export async function submitProperty(payload: PropertySubmissionPayload): Promise<SubmissionResult> {
  const response = await axios.post<SubmissionResult>(
    `${API_PREFIX}/properties/submit`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    },
  );
  return response.data;
}

export async function submitPropertyFormData(formData: FormData): Promise<SubmissionResult> {
  const response = await axios.post<SubmissionResult>(`${API_PREFIX}/properties/submit`, formData, {
    withCredentials: true,
  });
  return response.data;
}
