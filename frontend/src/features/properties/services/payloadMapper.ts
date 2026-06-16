import type { PropertyFormValues } from '../schemas/propertySchema.ts';
import type { AgentData } from '../../../app/contexts/AgentContext.tsx';
import type { FileEntry } from '../../../components/ui/FileDropzone.tsx';

export interface MediaUploadMetadata {
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  storage_bucket?: string;
  public_path?: string;
  expires_at?: string;
}

export interface PropertySubmissionPayload {
  agent_user_id: string;
  agent_name: string;
  agent_email: string;
  cover_file_name: string;
  media_uploads?: MediaUploadMetadata[];
  media_upload_session_id?: string;
  [key: string]: string | number | boolean | MediaUploadMetadata[] | undefined;
}

/**
 * Maps form values + files + agent identity → multipart/form-data.
 * The backend consumes canonical property field names.
 */
export function buildFormData(
  values: PropertyFormValues,
  files: FileEntry[],
  coverFileName: string,
  agent: AgentData,
): FormData {
  const fd = new FormData();

  // Agent fields
  fd.append('agent_user_id', agent.agent_user_id);
  fd.append('agent_name', agent.agent_name);
  fd.append('agent_email', agent.agent_email);

  // Cover file reference
  fd.append('cover_file_name', coverFileName);

  const skippedFields: Array<keyof PropertyFormValues> = [
    'cover_file_name',
    'agent_user_id',
    'agent_name',
    'agent_email',
  ];

  for (const [key, val] of Object.entries(values) as [keyof PropertyFormValues, unknown][]) {
    if (skippedFields.includes(key)) continue;
    if (val === undefined || val === null) {
      fd.append(key, '');
      continue;
    }

    if (typeof val === 'boolean') {
      fd.append(key, String(val));
      continue;
    }

    if (typeof val === 'number') {
      fd.append(key, String(val));
      continue;
    }

    if (typeof val === 'string') {
      fd.append(key, val);
      continue;
    }

    if (Array.isArray(val)) {
      fd.append(key, JSON.stringify(val));
      continue;
    }

    fd.append(key, String(val));
  }

  for (const entry of files) {
    fd.append('files', entry.file, entry.file.name);
  }

  return fd;
}

export function buildPropertySubmitPayload(
  values: PropertyFormValues,
  mediaUploads: MediaUploadMetadata[],
  mediaUploadSessionId: string | undefined,
  coverFileName: string,
  agent: AgentData,
): PropertySubmissionPayload {
  const payload: PropertySubmissionPayload = {
    agent_user_id: agent.agent_user_id,
    agent_name: agent.agent_name,
    agent_email: agent.agent_email,
    cover_file_name: coverFileName,
    media_uploads: mediaUploads,
    ...(mediaUploadSessionId ? { media_upload_session_id: mediaUploadSessionId } : {}),
  };

  const skippedFields: Array<keyof PropertyFormValues | 'media_uploads' | 'media_upload_session_id'> = [
    'cover_file_name',
    'agent_user_id',
    'agent_name',
    'agent_email',
  ];

  for (const [key, val] of Object.entries(values) as [keyof PropertyFormValues, unknown][]) {
    if (skippedFields.includes(key)) continue;

    if (val === undefined || val === null) {
      payload[key as string] = '';
      continue;
    }

    if (typeof val === 'boolean') {
      payload[key as string] = val;
      continue;
    }

    if (typeof val === 'number') {
      payload[key as string] = val;
      continue;
    }

    if (typeof val === 'string') {
      payload[key as string] = val;
      continue;
    }

    if (Array.isArray(val)) {
      payload[key as string] = val.length > 0 ? JSON.stringify(val) : '';
      continue;
    }

    payload[key as string] = String(val);
  }

  return payload;
}
