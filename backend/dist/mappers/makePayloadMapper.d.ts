import type { MakePayload, MediaFile } from '../types.js';
import type { ValidatedPropertyPayload } from '../services/validatePropertyPayload.js';
export interface BuildMakePayloadArgs {
    property_id: string;
    submission_id: string;
    created_at: string;
    payload: ValidatedPropertyPayload;
    folder_name: string;
    folder_url: string;
    parent_folder_id: string;
    media_files: MediaFile[];
    total_size_bytes: number;
}
/**
 * Assembles the canonical Make webhook payload from validated form data
 * and resolved integration metadata (Drive, media).
 */
export declare function buildMakePayload(args: BuildMakePayloadArgs): MakePayload;
//# sourceMappingURL=makePayloadMapper.d.ts.map