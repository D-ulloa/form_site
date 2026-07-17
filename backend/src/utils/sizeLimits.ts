/** 1 GB hard cap for total upload size per submission. */
export const MAX_UPLOAD_SIZE_BYTES = 1_073_741_824;

/** Maximum number of media files accepted in a single submission. */
const configuredMaxMediaFiles = Number(process.env.MAX_MEDIA_FILES ?? '20');
export const MAX_MEDIA_FILES =
  Number.isFinite(configuredMaxMediaFiles) && configuredMaxMediaFiles > 0
    ? Math.floor(configuredMaxMediaFiles)
    : 20;

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
export function validateTotalSize(files: Express.Multer.File[]): boolean {
  return getTotalSize(files) <= MAX_UPLOAD_SIZE_BYTES;
}

/** Returns true if every file has an allowed MIME type. */
export function validateMimeTypes(files: Express.Multer.File[]): boolean {
  return files.every((f) => ALLOWED_MIME_TYPES.has(f.mimetype));
}

/** Returns true if every media descriptor has an allowed MIME type. */
export function validateMediaUploadDescriptors(
  uploads: Array<{ mime_type: string; size_bytes: number }>,
): boolean {
  if (uploads.length === 0) return true;
  if (uploads.length > MAX_MEDIA_FILES) return false;
  if (!uploads.every((upload) => upload.size_bytes > 0 && upload.size_bytes <= MAX_UPLOAD_SIZE_BYTES)) {
    return false;
  }
  if (!uploads.every((upload) => ALLOWED_MIME_TYPES.has(upload.mime_type))) {
    return false;
  }
  return true;
}

/** Returns the sum of all file sizes in bytes. */
export function getTotalSize(files: Express.Multer.File[]): number {
  return files.reduce((sum, f) => sum + f.size, 0);
}

/** Returns the total bytes from media descriptors. */
export function getUploadDescriptorTotalSize(
  uploads: Array<{ size_bytes: number }>,
): number {
  return uploads.reduce((sum, upload) => sum + upload.size_bytes, 0);
}
