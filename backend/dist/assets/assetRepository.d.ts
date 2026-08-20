import type { SupabaseClient } from '@supabase/supabase-js';
import { type OrganizationScope } from '../platform/scope.js';
import type { InitializeAssetSessionInput, SafeAssetRecord } from './types.js';
export declare function createAssetRepository(clientOverride?: SupabaseClient, environment?: NodeJS.ProcessEnv): {
    initialize(scope: OrganizationScope, input: InitializeAssetSessionInput): Promise<Readonly<Record<string, unknown>>>;
    finalize(scope: OrganizationScope, input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
    revoke(scope: OrganizationScope, uploadSessionId: string, expectedVersion: number, requestId: string): Promise<Readonly<Record<string, unknown>>>;
    findSafe(scope: OrganizationScope, assetId: string): Promise<SafeAssetRecord | null>;
    findInternal(scope: OrganizationScope, assetId: string): Promise<Readonly<Record<string, unknown>> | null>;
    listSessionIntents(scope: OrganizationScope, sessionId: string): Promise<readonly (Record<string, unknown> & {
        organization_id: string;
    })[]>;
    recordUrlIssued(scope: OrganizationScope, sessionId: string, intentId: string, expiresAt: string): Promise<void>;
};
//# sourceMappingURL=assetRepository.d.ts.map