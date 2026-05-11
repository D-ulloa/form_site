import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { validatePropertyPayload } from '../services/validatePropertyPayload.js';
import { buildFolderName } from '../services/buildFolderName.js';
import {
  createDriveFolder,
  uploadFilesToFolder,
} from '../services/googleDriveService.js';
import type { UploadedFile } from '../services/googleDriveService.js';
import { appendSheetRow } from '../services/googleSheetsService.js';
import { sendToMakeWebhook } from '../services/makeWebhookService.js';
import { persistSubmissionLog } from '../services/submissionLogger.js';
import { mapToSheetRow } from '../mappers/sheetRowMapper.js';
import { buildMakePayload } from '../mappers/makePayloadMapper.js';
import {
  validateTotalSize,
  validateMimeTypes,
  getTotalSize,
} from '../utils/sizeLimits.js';
import type {
  SubmissionResult,
  SubmissionStepResults,
  SubmissionLog,
  SubmissionOutcome,
} from '../types.js';

// ─── Router setup ─────────────────────────────────────────────────────────────

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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

// ─── Log builder (avoids assigning undefined to optional fields) ──────────────

function buildSubmissionLog(args: {
  property_id: string;
  submission_id: string;
  created_at: string;
  outcome: SubmissionOutcome;
  steps: SubmissionStepResults;
  drive_folder_name?: string;
  drive_folder_url?: string;
  error?: string;
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

// ─── POST /properties/submit ──────────────────────────────────────────────────

router.post('/submit', upload.array('files'), async (req, res) => {
  const files = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : [];

  // ── Step 1: Validate payload ─────────────────────────────────────────────
  const validation = validatePropertyPayload(req.body as unknown);
  if (!validation.success) {
    res
      .status(400)
      .json({ error: 'Validation failed', details: validation.errors });
    return;
  }
  const payload = validation.data;

  if (files.length > 0 && !validateMimeTypes(files)) {
    res
      .status(400)
      .json({ error: 'One or more files have an unsupported MIME type.' });
    return;
  }
  if (!validateTotalSize(files)) {
    res
      .status(400)
      .json({ error: 'Total upload size exceeds the 1 GB limit.' });
    return;
  }

  // ── Step 2: Generate IDs ─────────────────────────────────────────────────
  const property_id = generatePropertyId();
  const submission_id = generateSubmissionId();
  const created_at = new Date().toISOString();

  // Mutable step tracker — shared reference used throughout the handler
  const steps: SubmissionStepResults = {
    drive_folder: 'failed',
    file_upload: 'skipped',
    sheets: 'skipped',
    make: 'skipped',
  };

  const parentFolderId =
    process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID ?? '';

  // ── Step 3: Build folder name ────────────────────────────────────────────
  const folderName = buildFolderName({
    ciudad: payload.ciudad,
    tipo_propiedad: payload.tipo_propiedad,
    dirección: payload.dirección,
  });

  // ── Step 4: Create Drive folder ──────────────────────────────────────────
  let folder: { folder_id: string; folder_name: string; folder_url: string };
  try {
    folder = await createDriveFolder(folderName, parentFolderId);
    steps.drive_folder = 'ok';
  } catch (err) {
    const errMsg =
      err instanceof Error ? err.message : 'Drive folder creation failed';
    await persistSubmissionLog(
      buildSubmissionLog({
        property_id,
        submission_id,
        created_at,
        outcome: 'failure',
        steps,
        error: errMsg,
      }),
    );
    const result: SubmissionResult = {
      outcome: 'failure',
      property_id,
      submission_id,
      steps,
      error: errMsg,
    };
    res.status(500).json(result);
    return;
  }

  // ── Step 5: Upload media files ───────────────────────────────────────────
  let uploadedFiles: UploadedFile[] = [];
  try {
    if (files.length > 0) {
      uploadedFiles = await uploadFilesToFolder(files, folder.folder_id);
    }
    steps.file_upload = 'ok';
  } catch (err) {
    const errMsg =
      err instanceof Error ? err.message : 'File upload failed';
    steps.file_upload = 'failed';
    await persistSubmissionLog(
      buildSubmissionLog({
        property_id,
        submission_id,
        created_at,
        outcome: 'failure',
        steps,
        drive_folder_name: folder.folder_name,
        drive_folder_url: folder.folder_url,
        error: errMsg,
      }),
    );
    const result: SubmissionResult = {
      outcome: 'failure',
      property_id,
      submission_id,
      steps,
      drive_folder_name: folder.folder_name,
      drive_folder_url: folder.folder_url,
      error: errMsg,
    };
    res.status(500).json(result);
    return;
  }

  // ── Step 6: Build canonical payload ─────────────────────────────────────
  const mediaFiles = uploadedFiles.map(
    ({ name, mime_type, size_bytes, url }) => ({
      name,
      mime_type,
      size_bytes,
      url,
    }),
  );
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

  // ── Step 7: Append row to Google Sheets ──────────────────────────────────
  try {
    const sheetRow = mapToSheetRow(payload, {
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
    });
    await appendSheetRow(sheetRow);
    steps.sheets = 'ok';
  } catch (err) {
    const errMsg =
      err instanceof Error ? err.message : 'Sheets append failed';
    steps.sheets = 'failed';
    // Per failure policy: Sheets failed → do not send to Make
    await persistSubmissionLog(
      buildSubmissionLog({
        property_id,
        submission_id,
        created_at,
        outcome: 'failure',
        steps,
        drive_folder_name: folder.folder_name,
        drive_folder_url: folder.folder_url,
        error: errMsg,
      }),
    );
    const result: SubmissionResult = {
      outcome: 'failure',
      property_id,
      submission_id,
      steps,
      drive_folder_name: folder.folder_name,
      drive_folder_url: folder.folder_url,
      error: errMsg,
    };
    res.status(500).json(result);
    return;
  }

  // ── Step 8: Send payload to Make ─────────────────────────────────────────
  let finalOutcome: SubmissionOutcome = 'success';
  let makeError: string | undefined;
  try {
    await sendToMakeWebhook(makePayload);
    steps.make = 'ok';
  } catch (err) {
    steps.make = 'failed';
    // Per failure policy: Sheets ok + Make failed → partial_failure
    finalOutcome = 'partial_failure';
    makeError = err instanceof Error ? err.message : 'Make webhook failed';
  }

  // ── Step 9: Persist log ───────────────────────────────────────────────────
  await persistSubmissionLog(
    buildSubmissionLog({
      property_id,
      submission_id,
      created_at,
      outcome: finalOutcome,
      steps,
      drive_folder_name: folder.folder_name,
      drive_folder_url: folder.folder_url,
      ...(makeError !== undefined ? { error: makeError } : {}),
    }),
  );

  // ── Step 10: Return result ────────────────────────────────────────────────
  const result: SubmissionResult = {
    outcome: finalOutcome,
    property_id,
    submission_id,
    steps,
    drive_folder_name: folder.folder_name,
    drive_folder_url: folder.folder_url,
  };
  if (makeError !== undefined) result.error = makeError;

  const statusCode =
    finalOutcome === 'success' ? 200 : finalOutcome === 'partial_failure' ? 207 : 500;
  res.status(statusCode).json(result);
});

export default router;
