import axios from 'axios';

export interface RecoveryMediaFile {
  name: string;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
}

export interface RecoverySnapshot {
  formValues: Record<string, string | number | boolean>;
  mediaManifest: RecoveryMediaFile[];
  coverFileName: string;
}

export interface RecoveryFailure {
  phase: 'validation' | 'media_validation' | 'presign' | 'upload' | 'submit' | 'unexpected';
  code: string;
  message: string;
  httpStatus?: number;
  outcome?: 'failure' | 'partial_failure';
  steps?: Record<string, 'ok' | 'failed' | 'skipped'>;
  submissionId?: string;
  propertyId?: string;
}

export interface RecoveryDraft {
  id: string;
  version: number;
  form_values: RecoverySnapshot['formValues'];
  media_manifest: RecoveryMediaFile[];
  cover_file_name: string;
  status: 'open' | 'succeeded' | 'discarded';
  last_error: (RecoveryFailure & { occurred_at?: string; http_status?: number;
    submission_id?: string; property_id?: string }) | null;
  updated_at: string;
}

export interface RecoveryDraftSummary {
  id: string;
  version: number;
  title: string;
  address: string;
  mediaCount: number;
  updatedAt: string;
  lastError: RecoveryDraft['last_error'];
}

const API_PREFIX = import.meta.env.DEV ? '' : '/_/backend';

function path(organization: string): string {
  return `${API_PREFIX}/api/organizations/${encodeURIComponent(organization)}/properties/recovery-drafts`;
}

function headers(): Record<string, string> {
  const match = document.cookie.split(';').map((value) => value.trim())
    .find((value) => value.startsWith('form_site_csrf='));
  return match ? { 'X-CSRF-Token': decodeURIComponent(match.slice('form_site_csrf='.length)) } : {};
}

export async function listRecoveryDrafts(organization: string): Promise<RecoveryDraftSummary[]> {
  const response = await axios.get<{ drafts: RecoveryDraftSummary[] }>(path(organization), { withCredentials: true });
  return response.data.drafts;
}

export async function getRecoveryDraft(organization: string, draftId: string): Promise<RecoveryDraft> {
  const response = await axios.get<{ draft: RecoveryDraft }>(`${path(organization)}/${encodeURIComponent(draftId)}`,
    { withCredentials: true });
  return response.data.draft;
}

export async function createRecoveryDraft(organization: string, snapshot: RecoverySnapshot): Promise<RecoveryDraft> {
  const response = await axios.post<{ draft: RecoveryDraft }>(path(organization), snapshot,
    { withCredentials: true, headers: headers() });
  return response.data.draft;
}

export async function saveRecoveryDraft(organization: string, draft: RecoveryDraft,
  snapshot: RecoverySnapshot): Promise<RecoveryDraft> {
  const response = await axios.patch<{ draft: RecoveryDraft }>(`${path(organization)}/${encodeURIComponent(draft.id)}`,
    { ...snapshot, expectedVersion: draft.version }, { withCredentials: true, headers: headers() });
  return response.data.draft;
}

export async function recordRecoveryFailure(organization: string, draft: RecoveryDraft,
  snapshot: RecoverySnapshot, failure: RecoveryFailure): Promise<RecoveryDraft> {
  const response = await axios.post<{ draft: RecoveryDraft }>(
    `${path(organization)}/${encodeURIComponent(draft.id)}/failures`,
    { ...snapshot, expectedVersion: draft.version, failure },
    { withCredentials: true, headers: headers() },
  );
  return response.data.draft;
}

export async function discardRecoveryDraft(organization: string, draftId: string): Promise<void> {
  await axios.post(`${path(organization)}/${encodeURIComponent(draftId)}/discard`, {},
    { withCredentials: true, headers: headers() });
}
