import type { SupabaseClient } from '@supabase/supabase-js';
/** Signature detection and integrity checking, not a malware scanner. All downloads are attachments. */
export declare function createAssetContentDetector(clientOverride?: SupabaseClient, environment?: NodeJS.ProcessEnv): (bucket: string, path: string) => Promise<{
    detected_mime: string;
    checksum_sha256: string;
}>;
export declare function detectAssetBytes(bytes: Uint8Array): Promise<{
    detected_mime: string;
    checksum_sha256: string;
}>;
//# sourceMappingURL=contentDetector.d.ts.map