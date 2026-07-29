/** 1 GB hard cap for total upload size per submission. */
export declare const MAX_UPLOAD_SIZE_BYTES = 1073741824;
export declare const MAX_MEDIA_FILES: number;
/** Whitelisted MIME types for image and video uploads. */
export declare const ALLOWED_MIME_TYPES: Set<string>;
/** Returns true if total size of all files is within the 1 GB cap. */
export declare function validateTotalSize(files: Express.Multer.File[]): boolean;
/** Returns true if every file has an allowed MIME type. */
export declare function validateMimeTypes(files: Express.Multer.File[]): boolean;
/** Returns true if every media descriptor has an allowed MIME type. */
export declare function validateMediaUploadDescriptors(uploads: Array<{
    mime_type: string;
    size_bytes: number;
}>): boolean;
/** Returns the sum of all file sizes in bytes. */
export declare function getTotalSize(files: Express.Multer.File[]): number;
/** Returns the total bytes from media descriptors. */
export declare function getUploadDescriptorTotalSize(uploads: Array<{
    size_bytes: number;
}>): number;
//# sourceMappingURL=sizeLimits.d.ts.map