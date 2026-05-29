import { Router } from 'express';
import multer from 'multer';
import { validatePropertyPayload } from '../services/validatePropertyPayload.js';
import { createPropertySubmission } from '../services/createPropertySubmission.js';
import { validateMimeTypes, validateTotalSize } from '../utils/sizeLimits.js';
const MAX_VERCEL_SAFE_PAYLOAD_BYTES = 3_800_000;
const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_VERCEL_SAFE_PAYLOAD_BYTES,
    },
});
async function parseUploadFiles(req, res) {
    if (!req.is('multipart/form-data')) {
        return [];
    }
    return new Promise((resolve, reject) => {
        upload.array('files')(req, res, (err) => {
            if (err) {
                reject(err);
                return;
            }
            const files = Array.isArray(req.files)
                ? req.files
                : [];
            resolve(files);
        });
    });
}
function getTotalSize(files) {
    return files.reduce((sum, file) => sum + file.size, 0);
}
// ─── POST /properties/submit ──────────────────────────────────────────────────
//
// Accepts multipart/form-data:
//   • All property fields as text fields (see scheme.json + agent_* fields)
//   • files      — image/video files (platform cap: 3.8 MB total in this deployment, whitelisted MIME types)
//   • cover_file_name — filename of the designated cover image
router.get('/submit', (_req, res) => {
    res.status(405).json({
        error: 'Method Not Allowed',
        details: 'Use POST /properties/submit with multipart/form-data',
    });
});
router.post('/submit', async (req, res) => {
    let files = [];
    try {
        files = await parseUploadFiles(req, res);
    }
    catch (err) {
        if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
                error: 'Request payload too large',
                details: 'El total de archivos supera el límite soportado por esta implementación (3.8 MB máximo).',
            });
            return;
        }
        res.status(400).json({
            error: 'File parsing failed',
            details: err instanceof Error ? err.message : String(err),
        });
        return;
    }
    const totalUploadSize = getTotalSize(files);
    if (totalUploadSize > MAX_VERCEL_SAFE_PAYLOAD_BYTES) {
        res.status(413).json({
            error: 'Request payload too large',
            details: 'El total de archivos supera el límite soportado por esta implementación (3.8 MB máximo).',
        });
        return;
    }
    // Validate form fields
    const validation = validatePropertyPayload(req.body);
    if (!validation.success) {
        res
            .status(400)
            .json({ error: 'Validation failed', details: validation.errors });
        return;
    }
    // Validate uploaded files
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
    // Delegate all orchestration to the submission service
    const result = await createPropertySubmission(validation.data, files);
    const statusCode = result.outcome === 'success'
        ? 200
        : result.outcome === 'partial_failure'
            ? 207
            : 500;
    res.status(statusCode).json(result);
});
export default router;
//# sourceMappingURL=properties.js.map