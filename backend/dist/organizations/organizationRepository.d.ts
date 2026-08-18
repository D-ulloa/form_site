import { type SupabaseClient } from '@supabase/supabase-js';
import type { MembershipMutationRepository } from './membershipService.js';
import type { OrganizationSettingsRepository } from './organizationSettingsService.js';
import type { UserProfileRepository } from './userProfileService.js';
import type { InvitationIdentityContext, OrganizationMembershipRecord, OrganizationRecord, OrganizationSettingsRecord, PlatformActorContext } from './types.js';
export interface CreateOrganizationPersistenceInput {
    readonly organization_id: string;
    readonly slug: string;
    readonly display_name: string;
    readonly legal_name: string | null;
    readonly plan_key: string;
    readonly locale: string;
    readonly time_zone: string;
    readonly creation_source: 'platform' | 'migration';
    readonly initial_owner_user_id: string;
    readonly initial_owner_membership_id: string;
    readonly actor: PlatformActorContext;
}
export interface CreateInvitationPersistenceInput {
    readonly invitation_id: string;
    readonly organization_id: string;
    readonly email_normalized: string;
    readonly intended_role: 'admin' | 'member' | 'viewer';
    readonly token_hash: string;
    readonly token_prefix: string;
    readonly expires_at: string;
    readonly invited_by_membership_id: string;
    readonly request_id: string;
}
export interface InvitationRecord {
    readonly id: string;
    readonly organization_id: string;
    readonly email_normalized: string;
    readonly intended_role: 'admin' | 'member' | 'viewer';
    readonly status: 'pending' | 'accepted' | 'revoked' | 'replaced';
    readonly expires_at: string;
    readonly delivery_state: 'pending' | 'sent' | 'failed';
    readonly token_version: number;
    readonly version: number;
}
export interface InvitationResolutionRecord {
    readonly organization_display_name: string;
    readonly email_masked: string;
    readonly intended_role: 'admin' | 'member' | 'viewer';
    readonly expires_at: string;
}
export interface OrganizationGovernanceRepository {
    createOrganization(input: CreateOrganizationPersistenceInput): Promise<OrganizationRecord>;
    createInvitation(input: CreateInvitationPersistenceInput): Promise<InvitationRecord>;
    resolveInvitation(rawToken: string): Promise<InvitationResolutionRecord | null>;
    resendInvitation(input: {
        organization_id: string;
        invitation_id: string;
        replacement_invitation_id: string;
        token_hash: string;
        token_prefix: string;
        expires_at: string;
        actor_membership_id: string;
        request_id: string;
    }): Promise<InvitationRecord>;
    revokeInvitation(input: {
        organization_id: string;
        invitation_id: string;
        actor_membership_id: string;
        request_id: string;
    }): Promise<InvitationRecord>;
    acceptInvitation(rawToken: string, identity: InvitationIdentityContext): Promise<OrganizationMembershipRecord>;
    markInvitationDelivery(invitationId: string, state: 'sent' | 'failed', errorCode?: string): Promise<void>;
    getSettings(organizationId: string): Promise<OrganizationSettingsRecord | null>;
}
export declare function createOrganizationGovernanceRepository(environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient): OrganizationGovernanceRepository;
export declare function createMembershipMutationRepository(environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient): MembershipMutationRepository;
export declare function createOrganizationSettingsRepository(environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient): OrganizationSettingsRepository;
export declare function createUserProfileRepository(environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient): UserProfileRepository;
//# sourceMappingURL=organizationRepository.d.ts.map