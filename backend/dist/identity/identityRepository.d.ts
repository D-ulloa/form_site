import { type SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationMembershipRecord, OrganizationRecord } from '../organizations/types.js';
import type { AppSessionRecord, OrganizationApiKeyRecord, SessionIdentity, SessionTokenMaterial } from './types.js';
export interface SessionCreateInput {
    readonly identity: SessionIdentity;
    readonly material: SessionTokenMaterial;
    readonly remembered: boolean;
    readonly absolute_expires_at: string;
    readonly idle_expires_at: string;
    readonly request_id: string;
    readonly ip_network: string | null;
    readonly user_agent_summary: string | null;
    readonly active_session_limit: number;
}
export interface IdentityRepository {
    createSession(input: SessionCreateInput): Promise<AppSessionRecord>;
    findSession(tokenPrefix: string, tokenHash: string): Promise<AppSessionRecord | null>;
    touchSession(session: AppSessionRecord, idleExpiresAt: string, requestId: string, ip: string | null): Promise<AppSessionRecord>;
    rotateSession(session: AppSessionRecord, material: SessionTokenMaterial, absoluteExpiresAt: string, idleExpiresAt: string, requestId: string): Promise<AppSessionRecord>;
    revokeSession(session: AppSessionRecord, reason: string, requestId: string): Promise<void>;
    revokeOtherSessions(session: AppSessionRecord, requestId: string): Promise<number>;
    listUserSessions(userId: string): Promise<readonly AppSessionRecord[]>;
    getUser(userId: string): Promise<{
        readonly id: string;
        readonly email: string;
        readonly display_name: string;
    } | null>;
    listMemberships(userId: string): Promise<readonly {
        membership: OrganizationMembershipRecord;
        organization: OrganizationRecord;
    }[]>;
    getMembership(userId: string, organizationIdOrSlug: string): Promise<{
        membership: OrganizationMembershipRecord;
        organization: OrganizationRecord;
    } | null>;
    createApiKey(input: Omit<OrganizationApiKeyRecord, 'created_at' | 'last_used_at' | 'version'> & {
        readonly request_id: string;
    }): Promise<OrganizationApiKeyRecord>;
    findApiKey(prefix: string, hash: string): Promise<OrganizationApiKeyRecord | null>;
    touchApiKey(key: OrganizationApiKeyRecord, ip: string | null): Promise<void>;
    listApiKeys(organizationId: string): Promise<readonly OrganizationApiKeyRecord[]>;
    revokeApiKey(organizationId: string, keyId: string, membershipId: string, expectedVersion: number, reason: string, requestId: string): Promise<void>;
}
export declare function createIdentityRepository(environment?: NodeJS.ProcessEnv, override?: SupabaseClient): IdentityRepository;
//# sourceMappingURL=identityRepository.d.ts.map