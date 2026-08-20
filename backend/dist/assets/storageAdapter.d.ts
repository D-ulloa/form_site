import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProviderObjectMetadata } from './types.js';
export interface PrivateAssetStorageAdapter {
    issueUpload(bucketName: string, objectPath: string): Promise<{
        readonly upload_url: string;
        readonly required_headers: Readonly<Record<string, string>>;
    }>;
    inspect(bucketName: string, objectPath: string): Promise<ProviderObjectMetadata>;
    issueView(bucketName: string, objectPath: string, expiresInSeconds: number): Promise<{
        readonly signed_url: string;
        readonly expires_at: string;
    }>;
    remove(bucketName: string, objectPath: string): Promise<'deleted' | 'not_found'>;
}
export declare function createSupabaseAssetStorageAdapter(clientOverride?: SupabaseClient, environment?: NodeJS.ProcessEnv, now?: () => Date): PrivateAssetStorageAdapter;
//# sourceMappingURL=storageAdapter.d.ts.map