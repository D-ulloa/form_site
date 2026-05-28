import { v4 as uuidv4 } from 'uuid';
import { buildFolderName } from './buildFolderName.js';
import {
  createDriveFolder,
  uploadFilesToFolder,
} from './googleDriveService.js';
import { appendSheetRow } from './googleSheetsService.js';
import { sendToMakeWebhook } from './makeWebhookService.js';
import { persistSubmissionLog } from './submissionLogger.js';
import { mapToSheetRow } from '../mappers/sheetRowMapper.js';
import { buildMakePayload } from '../mappers/makePayloadMapper.js';
import { getTotalSize } from '../utils/sizeLimits.js';
import type { ValidatedPropertyPayload } from './validatePropertyPayload.js';
import type {
  SubmissionLog,
  SubmissionOutcome,
  SubmissionResult,
  SubmissionStepResults,
} from '../types.js';

function formatDriveQuotaError(rawMessage: string): string {
  if (rawMessage.includes('Service Accounts do not have storage quota')) {
    return `${rawMessage} Configure one of these in Vercel: OAuth credentials (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN) or GOOGLE_SUBJECT_EMAIL for delegated service account auth, or switch uploads to a shared Drive folder.`;
  }
  return rawMessage;
}

// ─── ID generators ────────────────────────────────────────────────────────────

function generatePropertyId(): string {
  const year = new Date().getFullYear();
  const suffix = (uuidv4().split('-')[0] ?? uuidv4()).toUpperCase();
  return `PROP-${year}-${suffix}`;
}

function generateSubmissionId(): string {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = (uuidv4().split('-')[0] ?? uuidv4()).toUpperCase();
  return `SUB-${date}-${suffix}`;
}

// ─── Log builder ──────────────────────────────────────────────────────────────

/**
 * Constructs a SubmissionLog, only setting optional fields when they carry a
 * real value — required by `exactOptionalPropertyTypes`.
 */
function buildLog(args: {
  property_id: string;
  submission_id: string;
  created_at: string;
  outcome: SubmissionOutcome;
  steps: SubmissionStepResults;
  drive_folder_name?: string;
  drive_folder_url?: string;
  error?: string | undefined;
}): SubmissionLog {
  const log: SubmissionLog = {
    property_id: args.property_id,
    submission_id: args.submission_id,
    created_at: args.created_at,
    outcome: args.outcome,
    steps: args.steps,
  };
  if (args.drive_folder_name !== undefined)
    log.drive_folder_name = args.drive_folder_name;
  if (args.drive_folder_url !== undefined)
    log.drive_folder_url = args.drive_folder_url;
  if (args.error !== undefined) log.error = args.error;
  return log;
}

// ─── Orchestration ────────────────────────────────────────────────────────────

/**
 * Runs the full 10-step property submission flow and returns a SubmissionResult.
 * HTTP concerns (status codes, request parsing) are handled by the caller.
 *
 * Failure policy:
 *  - Drive creation fails  → outcome: failure  (stop)
 *  - File upload fails     → outcome: failure  (stop)
 *  - Sheets fails          → outcome: failure  (stop, skip Make)
 *  - Make fails            → outcome: partial_failure (Sheets already written)
 */
export async function createPropertySubmission(
  payload: ValidatedPropertyPayload,
  files: Express.Multer.File[],
): Promise<SubmissionResult> {
  // ── Step 2: Generate IDs ───────────────────────────────────────────────────
  const property_id = generatePropertyId();
  const submission_id = generateSubmissionId();
  const created_at = new Date().toISOString();

  const steps: SubmissionStepResults = {
    drive_folder: 'failed',
    file_upload: 'skipped',
    sheets: 'skipped',
    make: 'skipped',
  };

  const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID ?? '';

  // ── Step 3: Build folder name ──────────────────────────────────────────────
  const folderName = buildFolderName({
    localidad: payload.Localidad,
    tipo_de_inmueble: payload['Tipo de Inmueble'],
    calle: payload.Calle,
  });

  // ── Step 4: Create Drive folder ────────────────────────────────────────────
  let folder: { folder_id: string; folder_name: string; folder_url: string };
  try {
    folder = await createDriveFolder(folderName, parentFolderId);
    steps.drive_folder = 'ok';
  } catch (err) {
    const error =
      err instanceof Error ? err.message : 'Drive folder creation failed';
    await persistSubmissionLog(
      buildLog({ property_id, submission_id, created_at, outcome: 'failure', steps, error }),
    );
    return { outcome: 'failure', property_id, submission_id, steps, error };
  }

  // ── Step 5: Upload media files ─────────────────────────────────────────────
  let uploadedFiles: Awaited<ReturnType<typeof uploadFilesToFolder>> = [];
  try {
    if (files.length > 0) {
      uploadedFiles = await uploadFilesToFolder(files, folder.folder_id);
    }
    steps.file_upload = 'ok';
  } catch (err) {
    const error =
      err instanceof Error
        ? formatDriveQuotaError(err.message)
        : formatDriveQuotaError('File upload failed');
    steps.file_upload = 'failed';
    await persistSubmissionLog(
      buildLog({
        property_id, submission_id, created_at, outcome: 'failure', steps,
        drive_folder_name: folder.folder_name,
        drive_folder_url: folder.folder_url,
        error,
      }),
    );
    return {
      outcome: 'failure', property_id, submission_id, steps,
      drive_folder_name: folder.folder_name,
      drive_folder_url: folder.folder_url,
      error,
    };
  }

  // ── Step 6: Build canonical payload ───────────────────────────────────────
  const mediaFiles = uploadedFiles.map(({ name, mime_type, size_bytes, url }) => ({
    name, mime_type, size_bytes, url,
  }));
  const makePayload = buildMakePayload({
    property_id,
    submission_id,
    created_at,
    payload,
    folder_name: folder.folder_name,
    folder_url: folder.folder_url,
    parent_folder_id: parentFolderId,
    media_files: mediaFiles,
    total_size_bytes: getTotalSize(files),
  });

  // ── Step 7: Append row to Google Sheets ───────────────────────────────────
  let sheetError: string | undefined;
  try {
    await appendSheetRow(
      mapToSheetRow(payload, {
        property_id,
        submission_id,
        created_at,
        agent_name: payload.agent_name,
        agent_email: payload.agent_email,
        drive_folder_name: folder.folder_name,
        drive_folder_url: folder.folder_url,
        media_file_count: uploadedFiles.length,
        make_status: 'pending',
        sheets_status: 'ok',
      }),
    );
    steps.sheets = 'ok';
  } catch (err) {
    sheetError = err instanceof Error ? err.message : 'Sheets append failed';
    steps.sheets = 'failed';
  }

  // ── Step 8: Send payload to Make ──────────────────────────────────────────
  let makeError: string | undefined;
  try {
    await sendToMakeWebhook(makePayload);
    steps.make = 'ok';
  } catch (err) {
    steps.make = 'failed';
    makeError = err instanceof Error ? err.message : 'Make webhook failed';
  }

  let finalOutcome: SubmissionOutcome = 'success';
  if (steps.make === 'failed' && steps.sheets === 'failed') {
    finalOutcome = 'failure';
  } else if (steps.make === 'failed' || steps.sheets === 'failed') {
    finalOutcome = 'partial_failure';
  }

  const combinedError = [sheetError, makeError].filter(Boolean).join(' | ');

  // ── Step 9: Persist log ────────────────────────────────────────────────────
  await persistSubmissionLog(
    buildLog({
      property_id,
      submission_id,
      created_at,
      outcome: finalOutcome,
      steps,
      drive_folder_name: folder.folder_name,
      drive_folder_url: folder.folder_url,
      error: combinedError || undefined,
    }),
  );

  // ── Step 10: Return result ─────────────────────────────────────────────────
  const result: SubmissionResult = {
    outcome: finalOutcome,
    property_id,
    submission_id,
    steps,
    drive_folder_name: folder.folder_name,
    drive_folder_url: folder.folder_url,
  };
  if (combinedError) result.error = combinedError;
  return result;
}
