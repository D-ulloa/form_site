import type { OrganizationCapability, OrganizationMembershipRecord, OrganizationRecord } from '../organizations/types.js';
export type AuthMethod = 'password' | 'google' | 'sso' | 'recovery';
export type AssuranceLevel = 'aal1' | 'aal2';
export interface AppSessionRecord {
    readonly id: string;
    readonly user_id: string;
    readonly token_prefix: string;
    readonly token_hash: string;
    readonly hash_version: number;
    readonly csrf_token_hash: string;
    readonly auth_method: AuthMethod;
    readonly assurance_level: AssuranceLevel;
    readonly created_at: string;
    readonly authenticated_at: string;
    readonly absolute_expires_at: string;
    readonly idle_expires_at: string | null;
    readonly remembered: boolean;
    readonly last_seen_at: string;
    readonly revoked_at: string | null;
    readonly rotated_from_session_id: string | null;
    readonly version: number;
}
export interface SessionTokenMaterial {
    readonly raw_token: string;
    readonly token_prefix: string;
    readonly token_hash: string;
    readonly csrf_token: string;
    readonly csrf_token_hash: string;
    readonly hash_version: number;
}
export interface SessionIdentity {
    readonly user_id: string;
    readonly email: string;
    readonly display_name: string;
    readonly auth_method: AuthMethod;
    readonly assurance_level: AssuranceLevel;
}
export interface SessionMembershipSummary {
    readonly organization_id: string;
    readonly organization_slug: string;
    readonly organization_display_name: string;
    readonly organization_status: OrganizationRecord['status'];
    readonly membership_id: string;
    readonly membership_status: OrganizationMembershipRecord['status'];
    readonly role: OrganizationMembershipRecord['role'];
    readonly capabilities: readonly OrganizationCapability[];
}
export interface OrganizationRequestContext {
    readonly principal_type: 'member';
    readonly request_id: string;
    readonly session_id: string;
    readonly user_id: string;
    readonly display_name: string;
    readonly assurance_level: AssuranceLevel;
    readonly organization: OrganizationRecord;
    readonly membership: OrganizationMembershipRecord;
    readonly capabilities: ReadonlySet<OrganizationCapability>;
}
export interface OrganizationApiKeyRecord {
    readonly id: string;
    readonly organization_id: string;
    readonly name: string;
    readonly key_prefix: string;
    readonly secret_hash: string;
    readonly hash_version: number;
    readonly scopes: readonly string[];
    readonly status: 'active' | 'revoked';
    readonly created_by_membership_id: string;
    readonly created_at: string;
    readonly expires_at: string;
    readonly last_used_at: string | null;
    readonly allowed_ip_cidrs: readonly string[];
    readonly version: number;
}
export interface OrganizationApiKeyContext {
    readonly principal_type: 'organization_api_key';
    readonly request_id: string;
    readonly organization_id: string;
    readonly api_key_id: string;
    readonly scopes: ReadonlySet<string>;
}
//# sourceMappingURL=types.d.ts.map