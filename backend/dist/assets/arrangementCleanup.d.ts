import type { SupabaseClient } from '@supabase/supabase-js';
import type { PrivateAssetStorageAdapter } from './storageAdapter.js';
import type { OrganizationScope } from '../platform/scope.js';
/** A scheduler must invoke this explicitly per organization after approving POL-09 activation. */
export declare function cleanupArrangementAssets(client: SupabaseClient, storage: PrivateAssetStorageAdapter, scope: OrganizationScope): Promise<{
    organization_id: string;
    deleted: number;
    failed: number;
    has_more: boolean;
}>;
//# sourceMappingURL=arrangementCleanup.d.ts.map