/** 1 GB hard cap for total upload size per submission. */
export declare const MAX_UPLOAD_SIZE_BYTES = 1073741824;
/** Whitelisted MIME types for image and video uploads. */
export declare const ALLOWED_MIME_TYPES: Set<string>;
/** Returns true if total size of all files is within the 1 GB cap. */
export declare function validateTotalSize(files: Express.Multer.File[]): boolean;
/** Returns true if every file has an allowed MIME type. */
export declare function validateMimeTypes(files: Express.Multer.File[]): boolean;
/** Returns the sum of all file sizes in bytes. */
export declare function getTotalSize(files: Express.Multer.File[]): number;
//# sourceMappingURL=sizeLimits.d.ts.map