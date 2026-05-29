/** 1 GB hard cap for total upload size per submission. */
export const MAX_UPLOAD_SIZE_BYTES = 1_073_741_824;
/** Whitelisted MIME types for image and video uploads. */
export const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/mpeg',
]);
/** Returns true if total size of all files is within the 1 GB cap. */
export function validateTotalSize(files) {
    return getTotalSize(files) <= MAX_UPLOAD_SIZE_BYTES;
}
/** Returns true if every file has an allowed MIME type. */
export function validateMimeTypes(files) {
    return files.every((f) => ALLOWED_MIME_TYPES.has(f.mimetype));
}
/** Returns the sum of all file sizes in bytes. */
export function getTotalSize(files) {
    return files.reduce((sum, f) => sum + f.size, 0);
}
//# sourceMappingURL=sizeLimits.js.map