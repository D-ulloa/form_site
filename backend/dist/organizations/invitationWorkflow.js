import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { OrganizationDomainError } from './errors.js';
function failure(error) {
    if (error?.message.includes('FORBIDDEN'))
        throw new OrganizationDomainError('FORBIDDEN');
    if (error?.message.includes('NOT_FOUND'))
        throw new OrganizationDomainError('NOT_FOUND');
    if (error?.message.includes('INVITATION_INVALID'))
        throw new OrganizationDomainError('INVITATION_INVALID');
    throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
}
export function createInvitationWorkflowRepository(environment = process.env, clientOverride) {
    const client = clientOverride ?? createPlatformServiceRoleClient(environment);
    return {
        async beginDelivery(input) {
            const { error } = await client.rpc('spec37_begin_invitation_delivery', {
                p_attempt_id: input.attempt_id, p_invitation_id: input.invitation_id, p_provider: input.provider,
                p_template_version: input.template_version, p_locale: input.locale,
                p_idempotency_key: input.idempotency_key, p_request_id: input.request_id
            });
            if (error)
                failure(error);
        },
        async completeDelivery(input) {
            const { error } = await client.rpc('spec37_complete_invitation_delivery', {
                p_attempt_id: input.attempt_id, p_state: input.state, p_provider_reference_hash: input.provider_reference_hash,
                p_safe_error_code: input.safe_error_code
            });
            if (error)
                failure(error);
        },
        async invalidateHandoffs(invitationId) {
            const { error } = await client.rpc('spec37_invalidate_invitation_handoffs', { p_invitation_id: invitationId });
            if (error)
                failure(error);
        },
        async createHandoff(input) {
            const { error } = await client.rpc('spec37_create_invitation_handoff', {
                p_raw_invitation_token: input.raw_invitation_token, p_handle_hash: input.handle_hash,
                p_browser_binding_hash: input.browser_binding_hash, p_origin_hash: input.origin_hash,
                p_expires_at: input.expires_at
            });
            if (error)
                failure(error);
        },
        async resolveHandoff(input) {
            const { data, error } = await client.rpc('spec37_resolve_invitation_handoff', {
                p_handle_hash: input.handle_hash, p_browser_binding_hash: input.browser_binding_hash,
                p_origin_hash: input.origin_hash
            }).maybeSingle();
            if (error)
                failure(error);
            return data;
        },
        async acceptHandoff(input) {
            const { data, error } = await client.rpc('spec37_accept_invitation_handoff', {
                p_handle_hash: input.handle_hash, p_browser_binding_hash: input.browser_binding_hash,
                p_origin_hash: input.origin_hash, p_user_id: input.identity.user_id,
                p_verified_email_normalized: input.identity.verified_email, p_request_id: input.identity.request_id,
            }).single();
            if (error || !data)
                failure(error ?? { message: 'INVITATION_INVALID' });
            return data;
        },
        async organizationSlug(organizationId) {
            const { data, error } = await client.from('organizations').select('slug')
                .eq('id', organizationId).single();
            if (error || !data)
                failure(error ?? { message: 'NOT_FOUND' });
            return String(data.slug);
        },
        async recordWebhook(input) {
            const { data, error } = await client.rpc('spec37_record_invitation_webhook', {
                p_event_id_hash: input.event_id_hash, p_event_type: input.event_type,
                p_provider_reference_hash: input.provider_reference_hash
            });
            if (error)
                failure(error);
            return data === true;
        },
        async listMembers(organizationId, membershipId, cursor, limit) {
            const { data, error } = await client.rpc('spec37_list_members', { p_organization_id: organizationId, p_actor_membership_id: membershipId, p_after_id: cursor, p_limit: limit });
            if (error)
                failure(error);
            return (data ?? []);
        },
        async listInvitations(organizationId, membershipId, cursor, limit) {
            const { data, error } = await client.rpc('spec37_list_invitations', { p_organization_id: organizationId, p_actor_membership_id: membershipId, p_after_id: cursor, p_limit: limit });
            if (error)
                failure(error);
            return (data ?? []);
        },
        async registrationContext(input) {
            const { data, error } = await client.rpc('spec37_resolve_invitation_registration', {
                p_handle_hash: input.handle_hash, p_browser_binding_hash: input.browser_binding_hash,
                p_origin_hash: input.origin_hash
            }).maybeSingle();
            if (error)
                failure(error);
            return data;
        },
        async completeRegistration(input) {
            const { error } = await client.rpc('spec37_complete_invitation_registration', {
                p_handle_hash: input.handle_hash, p_browser_binding_hash: input.browser_binding_hash,
                p_origin_hash: input.origin_hash, p_user_id: input.user_id, p_display_name: input.display_name,
                p_request_id: input.request_id
            });
            if (error)
                failure(error);
        },
    };
}
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
export class InvitationWorkflowService {
    repository;
    delivery;
    config;
    now;
    constructor(repository, delivery, config, now = () => new Date()) {
        this.repository = repository;
        this.delivery = delivery;
        this.config = config;
        this.now = now;
    }
    invalidate(invitationId) { return this.repository.invalidateHandoffs(invitationId); }
    acceptanceUrl(rawToken) {
        const url = new URL('/invitations/accept', this.config.public_base_url);
        url.hash = `invitation_token=${rawToken}`;
        return url.toString();
    }
    manualLink(invitation, rawToken) {
        if (!this.config.enabled || this.config.delivery_method !== 'share_link') {
            throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
        }
        return { invitation_id: invitation.id, status: invitation.status, delivery_state: 'pending',
            delivery_method: 'share_link', expires_at: invitation.expires_at, next_action: 'copy_or_revoke',
            share_url: this.acceptanceUrl(rawToken) };
    }
    async deliver(invitation, rawToken, input) {
        if (!this.config.enabled || this.config.adapter === 'disabled')
            throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
        const attemptId = randomUUID();
        const idempotencyKey = `invitation/${invitation.id}/${invitation.token_version}`;
        await this.repository.beginDelivery({ attempt_id: attemptId, invitation_id: invitation.id,
            provider: this.config.adapter, template_version: this.config.template_version, locale: 'es',
            idempotency_key: idempotencyKey, request_id: input.request_id });
        const result = await this.delivery.send({ attempt_id: attemptId, idempotency_key: idempotencyKey,
            recipient: invitation.email_normalized, organization_display_name: input.organization_display_name,
            inviter_display_name: input.inviter_display_name, intended_role: invitation.intended_role,
            expires_at: invitation.expires_at, acceptance_url: this.acceptanceUrl(rawToken), locale: 'es',
            template_version: this.config.template_version });
        const referenceHash = result.provider_reference ? createHmac('sha256', this.config.provider_reference_pepper)
            .update(result.provider_reference).digest('hex') : null;
        await this.repository.completeDelivery({ attempt_id: attemptId, state: result.outcome,
            provider_reference_hash: referenceHash, safe_error_code: result.safe_error_code ?? null });
        return { invitation_id: invitation.id, status: invitation.status, delivery_method: 'email',
            delivery_state: result.outcome === 'accepted_by_provider' ? 'accepted_by_provider'
                : result.outcome === 'rejected' ? 'failed' : 'pending', expires_at: invitation.expires_at,
            next_action: result.outcome === 'accepted_by_provider' ? 'wait' : 'resend_or_revoke' };
    }
    registrationContext(handle, binding, origin) {
        return this.repository.registrationContext({ handle_hash: digest(handle), browser_binding_hash: digest(binding),
            origin_hash: digest(origin) });
    }
    completeRegistration(handle, binding, origin, userId, displayName, requestId) {
        return this.repository.completeRegistration({ handle_hash: digest(handle), browser_binding_hash: digest(binding),
            origin_hash: digest(origin), user_id: userId, display_name: displayName, request_id: requestId });
    }
    async createHandoff(rawToken, browserBinding, origin) {
        if (rawToken.length < 32 || rawToken.length > 256)
            throw new OrganizationDomainError('INVITATION_INVALID');
        const handle = randomBytes(32).toString('base64url');
        const binding = browserBinding ?? randomBytes(32).toString('base64url');
        await this.repository.createHandoff({ raw_invitation_token: rawToken, handle_hash: digest(handle),
            browser_binding_hash: digest(binding), origin_hash: digest(origin),
            expires_at: new Date(this.now().getTime() + 15 * 60_000).toISOString() });
        return { handle, browser_binding: binding, max_age_seconds: 900 };
    }
    resolveHandoff(handle, binding, origin) {
        return this.repository.resolveHandoff({ handle_hash: digest(handle), browser_binding_hash: digest(binding), origin_hash: digest(origin) });
    }
    async acceptHandoff(handle, binding, origin, identity) {
        const membership = await this.repository.acceptHandoff({ handle_hash: digest(handle), browser_binding_hash: digest(binding),
            origin_hash: digest(origin), identity });
        return { membership, organization_slug: await this.repository.organizationSlug(membership.organization_id) };
    }
    async webhook(eventId, type, providerReference) {
        return this.repository.recordWebhook({ event_id_hash: digest(eventId), event_type: type,
            provider_reference_hash: createHmac('sha256', this.config.provider_reference_pepper).update(providerReference).digest('hex') });
    }
    async listMembers(actor, cursor) {
        const items = await this.repository.listMembers(actor.organization.id, actor.membership.id, cursor, 51);
        return { items: items.slice(0, 50).map(({ cursor_id: _cursor, ...item }) => item),
            next_cursor: items.length > 50 ? String(items[49]?.cursor_id ?? '') : null };
    }
    async listInvitations(actor, cursor) {
        const items = await this.repository.listInvitations(actor.organization.id, actor.membership.id, cursor, 51);
        return { items: items.slice(0, 50).map(({ cursor_id: _cursor, ...item }) => item),
            next_cursor: items.length > 50 ? String(items[49]?.cursor_id ?? '') : null };
    }
}
//# sourceMappingURL=invitationWorkflow.js.map