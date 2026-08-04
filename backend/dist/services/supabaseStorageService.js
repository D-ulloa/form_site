import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES } from '../utils/sizeLimits.js';
const TEN_MINUTES_SECONDS = 600;
const DEFAULT_BUCKET = 'property-media';
function normalizeSupabaseBucket() {
    return process.env.SUPABASE_MEDIA_BUCKET || DEFAULT_BUCKET;
}
function resolveUploadTtl() {
    const value = Number(process.env.SUPABASE_SIGNED_UPLOAD_TTL_SECONDS ?? TEN_MINUTES_SECONDS);
    if (!Number.isFinite(value) || value <= 0)
        return TEN_MINUTES_SECONDS;
    return Math.min(Math.floor(value), 60 * 60);
}
function resolveDownloadTtl() {
    const value = Number(process.env.SUPABASE_SIGNED_DOWNLOAD_TTL_SECONDS ?? TEN_MINUTES_SECONDS);
    if (!Number.isFinite(value) || value <= 0)
        return TEN_MINUTES_SECONDS;
    return Math.min(Math.floor(value), 60 * 60);
}
function validateStorageEnv() {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
        throw new Error('Supabase credentials are not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).');
    }
    return { url, serviceRoleKey };
}
function createSupabaseClient() {
    const { url, serviceRoleKey } = validateStorageEnv();
    return createClient(url, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
function sanitizeFileName(rawName) {
    const basename = path.basename(rawName)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!basename) {
        return randomUUID();
    }
    return basename.slice(0, 120);
}
function buildStoragePath(descriptor) {
    const uploadPrefix = process.env.SUPABASE_UPLOAD_PATH_PREFIX || 'properties';
    const dateSegment = new Date().toISOString().slice(0, 10);
    const fileName = sanitizeFileName(descriptor.originalName);
    return `${uploadPrefix.replace(/\/+$/, '')}/${dateSegment}/${randomUUID()}-${fileName}`;
}
function validateDescriptors(descriptors) {
    if (!descriptors.every((item) => item.originalName.trim().length > 0)) {
        throw new Error('Every file must have an originalName.');
    }
    if (!descriptors.every((item) => ALLOWED_MIME_TYPES.has(item.mimeType))) {
        throw new Error('One or more file types are not allowed.');
    }
    if (!descriptors.every((item) => Number.isFinite(item.sizeBytes) && item.sizeBytes > 0)) {
        throw new Error('Every file must include a valid sizeBytes > 0.');
    }
    if (!descriptors.every((item) => item.sizeBytes <= MAX_UPLOAD_SIZE_BYTES)) {
        throw new Error('One or more files exceed the maximum allowed size.');
    }
}
export async function issueSignedUploadUrls(descriptors) {
    const bucket = normalizeSupabaseBucket();
    validateDescriptors(descriptors);
    const supabase = createSupabaseClient();
    void resolveUploadTtl();
    const results = [];
    for (const descriptor of descriptors) {
        const storagePath = buildStoragePath(descriptor);
        const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUploadUrl(storagePath, { upsert: false });
        if (error || !data?.signedUrl || !data?.path) {
            const detail = error?.message ?? 'Unable to generate signed upload URL';
            throw new Error(detail);
        }
        const publicPath = `${bucket}/${data.path}`;
        results.push({
            originalName: descriptor.originalName,
            uploadUrl: data.signedUrl,
            publicPath,
            storagePath: data.path,
            storageBucket: bucket,
        });
    }
    return results;
}
export async function issueSignedDownloadUrl(storagePath, storageBucket) {
    const bucket = storageBucket || normalizeSupabaseBucket();
    if (!storagePath) {
        throw new Error('storagePath is required to build a signed download URL.');
    }
    const supabase = createSupabaseClient();
    const ttl = resolveDownloadTtl();
    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, ttl);
    if (error || !data?.signedUrl) {
        const detail = error?.message ?? 'Unable to generate signed download URL';
        throw new Error(detail);
    }
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    return {
        signedUrl: data.signedUrl,
        expiresAt,
    };
}
//# sourceMappingURL=supabaseStorageService.js.map