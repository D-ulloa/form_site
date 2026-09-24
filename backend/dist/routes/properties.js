import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { validatePropertyPayload } from '../services/validatePropertyPayload.js';
import { createPropertySubmission, } from '../services/createPropertySubmission.js';
import { issueSignedUploadUrls, } from '../services/supabaseStorageService.js';
import { createUploadSession, consumeUploadSession, } from '../services/mediaUploadSessionService.js';
import { validateMimeTypes, validateTotalSize, validateMediaUploadDescriptors, getUploadDescriptorTotalSize, MAX_MEDIA_FILES, MAX_UPLOAD_SIZE_BYTES, } from '../utils/sizeLimits.js';
import { getContractPasswordSession, } from '../services/contractPasswordAuth.js';
import { assertCsrf, IdentityAccessError, IdentityConfigurationError, } from '../identity/sessionSecurity.js';
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
const MediaUploadDescriptorSchema = z.object({
    original_name: z.string().min(1, 'original_name is required'),
    storage_path: z.string().min(1, 'storage_path is required'),
    mime_type: z.string().min(1, 'mime_type is required'),
    size_bytes: z.number().int().positive('size_bytes must be greater than zero'),
    storage_bucket: z.string().optional(),
    public_path: z.string().optional(),
    expires_at: z.string().optional(),
});
const PresignRequestSchema = z.object({
    files: z.array(z.object({
        originalName: z.string().min(1, 'originalName is required'),
        mimeType: z.string().min(1, 'mimeType is required'),
        sizeBytes: z
            .number({ message: 'sizeBytes must be a valid number' })
            .int()
            .positive('sizeBytes must be greater than zero'),
    })),
});
function requirePropertySession(req, res) {
    const tenantSession = res.locals.propertySession;
    if (tenantSession?.isAdmin)
        return tenantSession;
    try {
        const session = getContractPasswordSession(req);
        if (session?.isAdmin)
            return session;
    }
    catch {
        // Configuration and malformed-cookie failures are deliberately non-enumerating.
    }
    res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        details: 'Iniciá sesión con una cuenta autorizada para gestionar propiedades.',
    });
    return null;
}
export function applyVerifiedPropertyActor(body, session) {
    body.agent_user_id = session.userId;
    body.agent_name = session.name;
    body.agent_email = session.email;
}
function tenantAuthError(res, error) {
    res.set('Cache-Control', 'no-store');
    if (error instanceof IdentityAccessError) {
        res.status(error.status).json({ error: error.code, retriable: false });
        return;
    }
    if (error instanceof IdentityConfigurationError) {
        res.status(503).json({ error: 'AUTH_DEPENDENCY_UNAVAILABLE', retriable: true });
        return;
    }
    res.status(503).json({ error: 'AUTH_DEPENDENCY_UNAVAILABLE', retriable: true });
}
/**
 * Transitional adapter for the organization-scoped UI. The legacy property
 * implementation remains behind its original reviewed-admin cookie, while
 * this wrapper derives the actor from the current revocable app session and
 * confirms properties.write for the organization in the URL.
 */
export function createTenantPropertyCompatibilityRouter(sessions, environment = process.env) {
    const tenantRouter = Router({ mergeParams: true });
    tenantRouter.use((req, res, next) => {
        void sessions.authenticate(req, false).then(async (authenticated) => {
            assertCsrf(req, authenticated.session.csrf_token_hash, environment);
            const context = await sessions.context(req, String(req.params.organization ?? ''), 'properties.write');
            if (context.user_id !== authenticated.identity.id) {
                throw new IdentityAccessError('AUTHENTICATION_REQUIRED', 401);
            }
            res.locals.propertySession = {
                userId: authenticated.identity.id,
                email: authenticated.identity.email,
                name: authenticated.identity.display_name,
                isAdmin: true,
            };
            next();
        }).catch((error) => tenantAuthError(res, error));
    });
    tenantRouter.use(router);
    return tenantRouter;
}
function parseMediaUploadSessionId(raw) {
    if (typeof raw !== 'string') {
        return undefined;
    }
    if (raw.trim().length === 0) {
        return undefined;
    }
    return raw;
}
function parseMediaUploads(raw) {
    if (raw === undefined || raw === '' || raw === null) {
        return [];
    }
    const parsedArray = typeof raw === 'string'
        ? (() => {
            try {
                return JSON.parse(raw);
            }
            catch {
                return raw;
            }
        })()
        : raw;
    if (!Array.isArray(parsedArray)) {
        throw new Error('media_uploads debe ser un arreglo de archivos de media.');
    }
    const parseResult = z.array(MediaUploadDescriptorSchema).safeParse(parsedArray);
    if (!parseResult.success) {
        const details = parseResult.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join(' | ');
        throw new Error(`media_uploads inválido: ${details}`);
    }
    return parseResult.data.map((media) => ({
        original_name: media.original_name,
        storage_path: media.storage_path,
        mime_type: media.mime_type,
        size_bytes: media.size_bytes,
        ...(media.storage_bucket ? { storage_bucket: media.storage_bucket } : {}),
        ...(media.public_path ? { public_path: media.public_path } : {}),
        ...(media.expires_at ? { expires_at: media.expires_at } : {}),
    }));
}
function isSupabaseUploadProvider() {
    return process.env.MEDIA_UPLOAD_PROVIDER === 'drive' ? 'drive' : 'supabase';
}
function isLegacyDriveFallbackEnabled() {
    return process.env.MEDIA_UPLOAD_LEGACY_DRIVE_WRITE === 'true';
}
function getUploadMode(args) {
    const { hasLegacyFiles, hasMediaUploads, provider } = args;
    if (hasMediaUploads) {
        return 'supabase';
    }
    if (hasLegacyFiles) {
        if (provider === 'drive' || isLegacyDriveFallbackEnabled()) {
            return 'drive';
        }
        return 'none';
    }
    return 'none';
}
// ─── POST /properties/media/presign ───────────────────────────────────────────
//
// 1) Client submits non-file descriptors ({ originalName, mimeType, sizeBytes }).
// 2) Server returns a per-file signed uploadUrl + internal storagePath.
// 3) Client uploads directly to the returned URL.
router.post('/media/presign', async (req, res) => {
    const session = requirePropertySession(req, res);
    if (!session)
        return;
    if (isSupabaseUploadProvider() === 'drive') {
        res.status(409).json({
            error: 'Presign not enabled',
            details: 'Set MEDIA_UPLOAD_PROVIDER=supabase to use direct uploads.',
        });
        return;
    }
    const parseResult = PresignRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
        const details = parseResult.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join(' | ');
        res.status(400).json({
            error: 'Invalid presign request',
            details,
        });
        return;
    }
    const files = parseResult.data.files;
    if (files.length === 0) {
        res.status(400).json({
            error: 'No files provided',
            details: 'media descriptors array cannot be empty.',
        });
        return;
    }
    if (files.length > MAX_MEDIA_FILES) {
        res.status(400).json({
            error: 'Too many files',
            details: `Maximum supported files is ${MAX_MEDIA_FILES}.`,
        });
        return;
    }
    if (files.some((file) => file.sizeBytes <= 0)) {
        res.status(400).json({
            error: 'Invalid file size',
            details: 'Every file must have sizeBytes > 0.',
        });
        return;
    }
    if (files.some((file) => file.sizeBytes > MAX_UPLOAD_SIZE_BYTES)) {
        res.status(400).json({
            error: 'One or more files exceed the maximum size',
            details: 'Each file must be <= 1 GB.',
        });
        return;
    }
    const sessionId = createUploadSession(session.userId);
    try {
        const presigned = await issueSignedUploadUrls(files.map((file) => ({
            originalName: file.originalName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
        })));
        res.status(200).json({
            upload_session_id: sessionId,
            media_uploads: presigned,
        });
    }
    catch (err) {
        const message = err instanceof Error
            ? err.message
            : 'No fue posible generar las URLs de carga.';
        res.status(500).json({
            error: 'Presign failed',
            details: message,
        });
    }
});
// ─── POST /properties/submit ──────────────────────────────────────────────────
//
// Accepts multipart/form-data (legacy):
//   • All property fields as text fields (see scheme.json + agent_* fields)
//   • files      — image/video files
//   • cover_file_name — filename of the designated cover image
//
// Accepts JSON with media_uploads (new):
//   • property fields + media_uploads metadata + media_upload_session_id
router.get('/submit', (_req, res) => {
    res.status(405).json({
        error: 'Method Not Allowed',
        details: 'Use POST /properties/submit with JSON or multipart/form-data',
    });
});
router.post('/submit', async (req, res) => {
    const session = requirePropertySession(req, res);
    if (!session)
        return;
    let files = [];
    try {
        files = await parseUploadFiles(req, res);
    }
    catch (err) {
        if (typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            err.code === 'LIMIT_FILE_SIZE') {
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
    const hasLegacyFiles = files.length > 0;
    const provider = isSupabaseUploadProvider();
    applyVerifiedPropertyActor(req.body, session);
    let media_uploads;
    let media_upload_session_id;
    try {
        media_uploads = parseMediaUploads(req.body.media_uploads);
        media_upload_session_id = parseMediaUploadSessionId(req.body.media_upload_session_id);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'media_uploads inválido';
        res.status(400).json({
            error: 'Invalid media upload metadata',
            details: message,
        });
        return;
    }
    const hasMediaUploads = media_uploads.length > 0;
    if (hasLegacyFiles && hasMediaUploads) {
        res.status(400).json({
            error: 'Solicitud inválida',
            details: 'No podés combinar archivos multipart y media_uploads al mismo tiempo.',
        });
        return;
    }
    const uploadMode = getUploadMode({
        hasLegacyFiles,
        hasMediaUploads,
        provider,
    });
    if (hasLegacyFiles && uploadMode === 'none') {
        res.status(400).json({
            error: 'Legacy upload path disabled',
            details: 'Este cliente ya requiere flow JSON (media_uploads + presign).',
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
    if (hasMediaUploads) {
        if (provider !== 'supabase') {
            res.status(400).json({
                error: 'Provider mismatch',
                details: 'MEDIA_UPLOAD_PROVIDER=drive does not accept media_uploads payloads.',
            });
            return;
        }
        if (!media_upload_session_id) {
            res.status(400).json({
                error: 'Missing upload session',
                details: 'Debe incluir media_upload_session_id emitido por /media/presign.',
            });
            return;
        }
        if (!consumeUploadSession(media_upload_session_id, validation.data.agent_user_id)) {
            res.status(400).json({
                error: 'Invalid upload session',
                details: 'media_upload_session_id inexistente o vencido.',
            });
            return;
        }
        if (media_uploads.length > MAX_MEDIA_FILES) {
            res.status(400).json({
                error: 'Too many files',
                details: `Maximum supported files is ${MAX_MEDIA_FILES}.`,
            });
            return;
        }
        if (!validateMediaUploadDescriptors(media_uploads)) {
            res.status(400).json({
                error: 'One or more files in media_uploads are invalid',
                details: 'Tipo o tamaño de archivo inválido.',
            });
            return;
        }
        if (getUploadDescriptorTotalSize(media_uploads) > MAX_UPLOAD_SIZE_BYTES) {
            res.status(413).json({
                error: 'Request payload too large',
                details: 'El total de archivos supera 1 GB (límite de media_uploads).',
            });
            return;
        }
    }
    // Validate multipart legacy files
    if (hasLegacyFiles) {
        if (files.length > MAX_MEDIA_FILES) {
            res.status(400).json({
                error: 'Too many files',
                details: `Maximum supported files is ${MAX_MEDIA_FILES}.`,
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
        if (files.length > 0 && !validateMimeTypes(files)) {
            res.status(400).json({
                error: 'One or more files have an unsupported MIME type.',
            });
            return;
        }
        if (!validateTotalSize(files)) {
            res.status(400).json({
                error: 'Total upload size exceeds the 1 GB limit.',
            });
            return;
        }
    }
    const result = await createPropertySubmission(validation.data, files, media_uploads, uploadMode);
    const statusCode = result.outcome === 'success'
        ? 200
        : result.outcome === 'partial_failure'
            ? 207
            : 500;
    res.status(statusCode).json(result);
});
export default router;
//# sourceMappingURL=properties.js.map