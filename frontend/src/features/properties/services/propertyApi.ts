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

function propertyApiPath(organization: string): string {
  return `${API_PREFIX}/api/organizations/${encodeURIComponent(organization)}/properties/legacy`;
}

function mutationHeaders(contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (contentType) headers['Content-Type'] = contentType;
  const match = document.cookie.split(';').map((value) => value.trim())
    .find((value) => value.startsWith('form_site_csrf='));
  if (match) headers['X-CSRF-Token'] = decodeURIComponent(match.slice('form_site_csrf='.length));
  return headers;
}

export function getMediaUploadProvider(): UploadClient {
  const provider =
    typeof import.meta.env.VITE_MEDIA_UPLOAD_PROVIDER === 'string'
      ? import.meta.env.VITE_MEDIA_UPLOAD_PROVIDER.toLowerCase()
      : 'supabase';

  return provider === 'drive' ? 'drive' : 'supabase';
}

export async function requestMediaUploadUrls(
  organization: string,
  files: MediaUploadRequestFile[],
): Promise<PresignResponse> {
  const response = await axios.post<PresignResponse>(
    `${propertyApiPath(organization)}/media/presign`,
    {
      files,
    },
    {
      headers: mutationHeaders('application/json'),
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

export async function submitProperty(
  organization: string,
  payload: PropertySubmissionPayload,
): Promise<SubmissionResult> {
  const response = await axios.post<SubmissionResult>(
    `${propertyApiPath(organization)}/submit`,
    payload,
    {
      headers: mutationHeaders('application/json'),
      withCredentials: true,
    },
  );
  return response.data;
}

export async function submitPropertyFormData(
  organization: string,
  formData: FormData,
): Promise<SubmissionResult> {
  const response = await axios.post<SubmissionResult>(`${propertyApiPath(organization)}/submit`, formData, {
    headers: mutationHeaders(),
    withCredentials: true,
  });
  return response.data;
}
