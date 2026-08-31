import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { mapOrganizationPersistenceError } from './errors.js';
function createGovernanceClient(environment) {
    return createPlatformServiceRoleClient(environment);
}
function requireData(data, error) {
    if (error || !data)
        mapOrganizationPersistenceError(error ?? { message: 'No record returned.' });
    return data;
}
export function createOrganizationGovernanceRepository(environment = process.env, clientOverride) {
    const client = () => clientOverride ?? createGovernanceClient(environment);
    return {
        async createOrganization(input) {
            const { data, error } = await client().rpc('spec26_create_organization', {
                p_organization_id: input.organization_id,
                p_slug: input.slug,
                p_display_name: input.display_name,
                p_legal_name: input.legal_name ?? '',
                p_plan_key: input.plan_key,
                p_locale: input.locale,
                p_time_zone: input.time_zone,
                p_creation_source: input.creation_source,
                p_created_by_user_id: input.actor.user_id,
                p_initial_owner_user_id: input.initial_owner_user_id,
                p_initial_owner_membership_id: input.initial_owner_membership_id,
                p_request_id: input.actor.request_id,
            }).single();
            return requireData(data, error);
        },
        async createInvitation(input) {
            const { data, error } = await client().rpc('spec37_create_manual_invitation', {
                p_invitation_id: input.invitation_id,
                p_organization_id: input.organization_id,
                p_email_normalized: input.email_normalized,
                p_intended_role: input.intended_role,
                p_token_hash: input.token_hash,
                p_token_prefix: input.token_prefix,
                p_expires_at: input.expires_at,
                p_invited_by_membership_id: input.invited_by_membership_id,
                p_request_id: input.request_id,
                p_invited_auth_user_id: input.invited_auth_user_id,
                p_registration_permitted: input.registration_permitted,
            }).single();
            return requireData(data, error);
        },
        async resolveInvitation(rawToken) {
            const { data, error } = await client().rpc('spec26_resolve_invitation', {
                p_raw_token: rawToken,
            }).maybeSingle();
            if (error)
                mapOrganizationPersistenceError(error);
            return data;
        },
        async resendInvitation(input) {
            const { data, error } = await client().rpc('spec37_resend_invitation', {
                p_organization_id: input.organization_id,
                p_invitation_id: input.invitation_id,
                p_replacement_invitation_id: input.replacement_invitation_id,
                p_token_hash: input.token_hash,
                p_token_prefix: input.token_prefix,
                p_expires_at: input.expires_at,
                p_actor_membership_id: input.actor_membership_id,
                p_request_id: input.request_id,
            }).single();
            return requireData(data, error);
        },
        async revokeInvitation(input) {
            const { data, error } = await client().rpc('spec37_revoke_invitation', {
                p_organization_id: input.organization_id,
                p_invitation_id: input.invitation_id,
                p_actor_membership_id: input.actor_membership_id,
                p_request_id: input.request_id,
            }).single();
            return requireData(data, error);
        },
        async acceptInvitation(rawToken, identity) {
            const { data, error } = await client().rpc('spec26_accept_invitation', {
                p_raw_token: rawToken,
                p_user_id: identity.user_id,
                p_verified_email_normalized: identity.verified_email,
                p_request_id: identity.request_id,
            }).single();
            return requireData(data, error);
        },
        async markInvitationDelivery(invitationId, state, errorCode) {
            const { error } = await client().rpc('spec26_mark_invitation_delivery', {
                p_invitation_id: invitationId,
                p_delivery_state: state,
                p_error_code: state === 'failed' ? errorCode ?? 'DELIVERY_FAILED' : null,
            });
            if (error)
                mapOrganizationPersistenceError(error);
        },
        async getSettings(organizationId) {
            const { data, error } = await client().from('organization_settings').select('*')
                .eq('organization_id', organizationId).maybeSingle();
            if (error)
                mapOrganizationPersistenceError(error);
            return data;
        },
    };
}
export function createMembershipMutationRepository(environment = process.env, clientOverride) {
    const client = () => clientOverride ?? createGovernanceClient(environment);
    return {
        async getMembership(organizationId, userId) {
            const { data, error } = await client().from('organization_memberships').select('*')
                .eq('organization_id', organizationId).eq('user_id', userId).maybeSingle();
            if (error)
                mapOrganizationPersistenceError(error);
            return data;
        },
        async listActiveOwnersForUpdate(organizationId) {
            const { data, error } = await client().from('organization_memberships').select('*')
                .eq('organization_id', organizationId).eq('status', 'active').eq('role', 'owner')
                .order('id', { ascending: true });
            if (error)
                mapOrganizationPersistenceError(error);
            return (data ?? []);
        },
        async changeRoleAtomic(input) {
            const { data, error } = await client().rpc('spec26_mutate_membership', {
                p_organization_id: input.organization_id,
                p_target_user_id: input.target_user_id,
                p_next_role: input.next_role,
                p_next_status: null,
                p_expected_version: input.expected_version,
                p_reason_code: null,
                p_actor_membership_id: input.actor_membership_id,
                p_request_id: input.request_id,
            }).single();
            return requireData(data, error);
        },
        async changeStatusAtomic(input) {
            const { data, error } = await client().rpc('spec26_mutate_membership', {
                p_organization_id: input.organization_id,
                p_target_user_id: input.target_user_id,
                p_next_role: null,
                p_next_status: input.next_status,
                p_expected_version: input.expected_version,
                p_reason_code: input.reason_code,
                p_actor_membership_id: input.actor_membership_id,
                p_request_id: input.request_id,
            }).single();
            return requireData(data, error);
        },
        async transferOwnershipAtomic(input) {
            const { data, error } = await client().rpc('spec26_transfer_ownership', {
                p_organization_id: input.organization_id,
                p_source_owner_membership_id: input.source_owner_membership_id,
                p_target_user_id: input.target_user_id,
                p_source_role_after: input.source_role_after,
                p_expected_organization_version: input.expected_organization_version,
                p_expected_target_membership_version: input.expected_target_membership_version,
                p_request_id: input.request_id,
            });
            if (error || !data)
                mapOrganizationPersistenceError(error ?? { message: 'No memberships returned.' });
            return data;
        },
    };
}
export function createOrganizationSettingsRepository(environment = process.env, clientOverride) {
    const client = () => clientOverride ?? createGovernanceClient(environment);
    return {
        async get(organizationId) {
            const { data, error } = await client().from('organization_settings').select('*')
                .eq('organization_id', organizationId).maybeSingle();
            if (error)
                mapOrganizationPersistenceError(error);
            return data;
        },
        async updateAtomic(input) {
            const { data, error } = await client().rpc('spec26_update_organization_settings', {
                p_organization_id: input.organization_id,
                p_expected_version: input.expected_version,
                p_public_display_name: input.public_display_name,
                p_primary_color: input.primary_color,
                p_accent_color: input.accent_color,
                p_feature_defaults: input.feature_defaults,
                p_actor_membership_id: input.actor_membership_id,
                p_request_id: input.request_id,
            }).single();
            return requireData(data, error);
        },
    };
}
export function createUserProfileRepository(environment = process.env, clientOverride) {
    const client = () => clientOverride ?? createGovernanceClient(environment);
    return {
        async get(userId) {
            const { data, error } = await client().from('user_profiles').select('*')
                .eq('user_id', userId).maybeSingle();
            if (error)
                mapOrganizationPersistenceError(error);
            return data;
        },
        async update(input) {
            const { data, error } = await client().from('user_profiles').update({
                display_name: input.display_name,
                locale: input.locale,
                time_zone: input.time_zone,
            }).eq('user_id', input.user_id).eq('version', input.expected_version).select('*').maybeSingle();
            if (error)
                mapOrganizationPersistenceError(error);
            return data;
        },
    };
}
//# sourceMappingURL=organizationRepository.js.map