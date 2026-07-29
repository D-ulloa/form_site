import { v4 as uuidv4 } from 'uuid';
import { buildFolderName } from './buildFolderName.js';
import { createDriveFolder, uploadFilesToFolder, } from './googleDriveService.js';
import { appendSheetRow } from './googleSheetsService.js';
import { sendToMakeWebhook } from './makeWebhookService.js';
import { persistSubmissionLog } from './submissionLogger.js';
import { mapToSheetRow } from '../mappers/sheetRowMapper.js';
import { buildMakePayload } from '../mappers/makePayloadMapper.js';
import { getTotalSize, getUploadDescriptorTotalSize } from '../utils/sizeLimits.js';
import { issueSignedDownloadUrl, } from './supabaseStorageService.js';
function formatDriveQuotaError(rawMessage) {
    if (rawMessage.includes('Service Accounts do not have storage quota')) {
        return `${rawMessage} Configure one of these in Vercel: OAuth credentials (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN) or GOOGLE_SUBJECT_EMAIL for delegated service account auth, or switch uploads to a shared Drive folder.`;
    }
    return rawMessage;
}
// ─── ID generators ────────────────────────────────────────────────────────────
function generatePropertyId() {
    const year = new Date().getFullYear();
    const suffix = (uuidv4().split('-')[0] ?? uuidv4()).toUpperCase();
    return `PROP-${year}-${suffix}`;
}
function generateSubmissionId() {
    const date = new Date().toISOString().slice(0, 10);
    const suffix = (uuidv4().split('-')[0] ?? uuidv4()).toUpperCase();
    return `SUB-${date}-${suffix}`;
}
// ─── Log builder ──────────────────────────────────────────────────────────────
/**
 * Constructs a SubmissionLog, only setting optional fields when they carry a
 * real value — required by `exactOptionalPropertyTypes`.
 */
function buildLog(args) {
    const log = {
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
    if (args.error !== undefined)
        log.error = args.error;
    if (args.upload_strategy !== undefined)
        log.upload_strategy = args.upload_strategy;
    if (args.supabase_object_count !== undefined)
        log.supabase_object_count = args.supabase_object_count;
    if (args.upload_byte_total !== undefined)
        log.upload_byte_total = args.upload_byte_total;
    return log;
}
function resolveUploadStrategy(uploadMode) {
    if (uploadMode === 'supabase')
        return 'supabase';
    if (uploadMode === 'drive')
        return 'drive';
    return process.env.MEDIA_UPLOAD_PROVIDER === 'drive' ? 'drive' : 'supabase';
}
// ─── Orchestration ────────────────────────────────────────────────────────────
/**
 * Runs the full property submission flow and returns a SubmissionResult.
 * HTTP concerns (status codes, request parsing) are handled by the caller.
 *
 * Failure policy:
 *  - Drive creation fails  → outcome: failure  (stop)
 *  - File upload fails     → outcome: failure  (stop)
 *  - Sheets fails          → outcome: failure  (stop, skip Make)
 *  - Make fails            → outcome: partial_failure (Sheets already written)
 */
export async function createPropertySubmission(payload, files, mediaUploads, uploadMode) {
    // ── Step 2: Generate IDs ───────────────────────────────────────────────────
    const property_id = generatePropertyId();
    const submission_id = generateSubmissionId();
    const created_at = new Date().toISOString();
    const steps = {
        drive_folder: 'failed',
        file_upload: 'skipped',
        drive_upload: 'skipped',
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
    let folder;
    try {
        folder = await createDriveFolder(folderName, parentFolderId);
        steps.drive_folder = 'ok';
    }
    catch (err) {
        const error = err instanceof Error ? err.message : 'Drive folder creation failed';
        const result = {
            outcome: 'failure',
            property_id,
            submission_id,
            upload_strategy: resolveUploadStrategy(uploadMode),
            steps,
            error,
        };
        await persistSubmissionLog(buildLog({
            property_id,
            submission_id,
            created_at,
            outcome: 'failure',
            steps,
            error,
        }));
        return result;
    }
    // ── Step 5: Resolve media file metadata for this submission ───────────────
    let mediaFiles = [];
    let upload_strategy = resolveUploadStrategy(uploadMode);
    let supabase_object_count = 0;
    let upload_byte_total = 0;
    if (uploadMode === 'supabase') {
        supabase_object_count = mediaUploads.length;
        upload_byte_total = getUploadDescriptorTotalSize(mediaUploads);
    }
    try {
        if (uploadMode === 'supabase') {
            const normalized = mediaUploads.map((media) => ({
                original_name: media.original_name,
                mime_type: media.mime_type,
                size_bytes: media.size_bytes,
                storage_path: media.storage_path,
                ...(media.storage_bucket ? { storage_bucket: media.storage_bucket } : {}),
                ...(media.public_path ? { public_path: media.public_path } : {}),
                ...(media.expires_at ? { expires_at: media.expires_at } : {}),
            }));
            const withSignedUrls = await Promise.all(normalized.map(async (media) => {
                const signed = await issueSignedDownloadUrl(media.storage_path, media.storage_bucket);
                return {
                    name: media.original_name,
                    mime_type: media.mime_type,
                    size_bytes: media.size_bytes,
                    storage_path: media.storage_path,
                    ...(media.storage_bucket ? { storage_bucket: media.storage_bucket } : {}),
                    ...(media.public_path ? { public_path: media.public_path } : {}),
                    url: signed.signedUrl,
                    expires_at: signed.expiresAt,
                };
            }));
            mediaFiles = withSignedUrls;
            steps.file_upload = 'ok';
            steps.drive_upload = 'skipped';
            upload_strategy = 'supabase';
        }
        else if (uploadMode === 'drive') {
            const uploadedFiles = await uploadFilesToFolder(files, folder.folder_id);
            mediaFiles = uploadedFiles.map(({ name, mime_type, size_bytes, url }) => ({
                name,
                mime_type,
                size_bytes,
                url,
            }));
            steps.file_upload = 'ok';
            steps.drive_upload = 'ok';
            upload_strategy = 'drive';
            upload_byte_total = getTotalSize(files);
            supabase_object_count = 0;
        }
    }
    catch (err) {
        const error = err instanceof Error ? err.message : 'File upload failed';
        steps.file_upload = 'failed';
        await persistSubmissionLog(buildLog({
            property_id,
            submission_id,
            created_at,
            outcome: 'failure',
            steps,
            drive_folder_name: folder.folder_name,
            drive_folder_url: folder.folder_url,
            upload_strategy,
            supabase_object_count,
            upload_byte_total,
            error: uploadMode === 'supabase'
                ? error
                : formatDriveQuotaError(error),
        }));
        return {
            outcome: 'failure',
            property_id,
            submission_id,
            drive_folder_name: folder.folder_name,
            drive_folder_url: folder.folder_url,
            upload_strategy,
            supabase_object_count,
            upload_byte_total,
            steps,
            error: uploadMode === 'supabase'
                ? error
                : formatDriveQuotaError(error),
        };
    }
    // ── Step 6: Build canonical payload ───────────────────────────────────────
    const makePayload = buildMakePayload({
        property_id,
        submission_id,
        created_at,
        payload,
        folder_name: folder.folder_name,
        folder_url: folder.folder_url,
        parent_folder_id: parentFolderId,
        media_files: mediaFiles,
        total_size_bytes: upload_byte_total,
    });
    // ── Step 7: Append row to Google Sheets ───────────────────────────────────
    let sheetError;
    try {
        await appendSheetRow(mapToSheetRow(payload, {
            property_id,
            submission_id,
            created_at,
            agent_name: payload.agent_name,
            agent_email: payload.agent_email,
            drive_folder_name: folder.folder_name,
            drive_folder_url: folder.folder_url,
            media_file_count: mediaFiles.length,
            make_status: 'pending',
            sheets_status: 'ok',
        }));
        steps.sheets = 'ok';
    }
    catch (err) {
        sheetError = err instanceof Error ? err.message : 'Sheets append failed';
        steps.sheets = 'failed';
    }
    // ── Step 8: Send payload to Make ──────────────────────────────────────────
    let makeError;
    try {
        await sendToMakeWebhook(makePayload);
        steps.make = 'ok';
    }
    catch (err) {
        steps.make = 'failed';
        makeError = err instanceof Error ? err.message : 'Make webhook failed';
    }
    let finalOutcome = 'success';
    if (steps.make === 'failed' && steps.sheets === 'failed') {
        finalOutcome = 'failure';
    }
    else if (steps.make === 'failed' || steps.sheets === 'failed') {
        finalOutcome = 'partial_failure';
    }
    const combinedError = [sheetError, makeError].filter(Boolean).join(' | ');
    // ── Step 9: Persist log ────────────────────────────────────────────────────
    await persistSubmissionLog(buildLog({
        property_id,
        submission_id,
        created_at,
        outcome: finalOutcome,
        steps,
        drive_folder_name: folder.folder_name,
        drive_folder_url: folder.folder_url,
        upload_strategy,
        supabase_object_count,
        upload_byte_total,
        error: combinedError || undefined,
    }));
    // ── Step 10: Return result ─────────────────────────────────────────────────
    const result = {
        outcome: finalOutcome,
        property_id,
        submission_id,
        steps,
        upload_strategy,
        supabase_object_count,
        upload_byte_total,
        drive_folder_name: folder.folder_name,
        drive_folder_url: folder.folder_url,
    };
    if (combinedError)
        result.error = combinedError;
    return result;
}
//# sourceMappingURL=createPropertySubmission.js.map