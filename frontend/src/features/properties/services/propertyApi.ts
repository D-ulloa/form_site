import axios from 'axios';

export interface SubmissionStepResults {
  drive_folder: 'ok' | 'failed' | 'skipped';
  file_upload: 'ok' | 'failed' | 'skipped';
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
  steps: SubmissionStepResults;
  error?: string;
}

export interface ApiError {
  message: string;
  status: number;
  details?: string[];
}

const API_PREFIX = import.meta.env.DEV ? '' : '/_/backend';

export async function submitProperty(formData: FormData): Promise<SubmissionResult> {
  const response = await axios.post<SubmissionResult>(`${API_PREFIX}/properties/submit`, formData, {
    // Let the browser set multipart boundaries automatically.
    // Setting Content-Type manually can break FormData encoding.
  });
  return response.data;
}
