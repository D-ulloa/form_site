import type { ValidatedPropertyPayload } from './validatePropertyPayload.js';
import type { SubmissionResult, MediaUploadMetadata } from '../types.js';
export type UploadMode = 'supabase' | 'drive' | 'none';
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
export declare function createPropertySubmission(payload: ValidatedPropertyPayload, files: Express.Multer.File[], mediaUploads: MediaUploadMetadata[], uploadMode: UploadMode): Promise<SubmissionResult>;
//# sourceMappingURL=createPropertySubmission.d.ts.map