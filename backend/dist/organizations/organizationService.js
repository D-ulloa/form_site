import { createHash, randomUUID } from 'node:crypto';
import { createInvitationProvisioningActor } from '../identity/identityProvisioningTypes.js';
import { OrganizationDomainError } from './errors.js';
import { createInvitationToken } from './invitationTokens.js';
import { allowedInvitationRoles, hasOrganizationCapability } from './roleCapabilities.js';
import { normalizeOrganizationEmail, validateDisplayName, validateLocale, validateOrganizationSlug, validateTimeZone, } from './validation.js';
const INVITATION_EXPIRY_MILLISECONDS = 72 * 60 * 60 * 1000;
const PLAN_KEYS = new Set(['internal', 'standard', 'enterprise']);
export class OrganizationService {
    repository;
    now;
    invitationWorkflow;
    identityProvisioning;
    constructor(repository, now = () => new Date(), invitationWorkflow, identityProvisioning) {
        this.repository = repository;
        this.now = now;
        this.invitationWorkflow = invitationWorkflow;
        this.identityProvisioning = identityProvisioning;
    }
    async createOrganization(input, actor) {
        if (!PLAN_KEYS.has(input.plan_key))
            throw new OrganizationDomainError('FORBIDDEN', 'Unknown server plan key.');
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
        if ((input.organization_id && !uuid.test(input.organization_id))
            || (input.initial_owner_membership_id && !uuid.test(input.initial_owner_membership_id))) {
            throw new OrganizationDomainError('FORBIDDEN', 'Invalid reserved organization identity.');
        }
        return this.repository.createOrganization({
            organization_id: input.organization_id ?? randomUUID(),
            slug: validateOrganizationSlug(input.slug),
            display_name: validateDisplayName(input.display_name),
            legal_name: input.legal_name ? validateDisplayName(input.legal_name, 240) : null,
            plan_key: input.plan_key,
            locale: validateLocale(input.locale),
            time_zone: validateTimeZone(input.time_zone),
            creation_source: input.creation_source,
            initial_owner_user_id: input.initial_owner_user_id,
            initial_owner_membership_id: input.initial_owner_membership_id ?? randomUUID(),
            actor,
        });
    }
    async inviteMember(input, actor) {
        if (!hasOrganizationCapability(actor.membership.role, actor.membership.status, actor.organization.status, 'members.invite')) {
            throw new OrganizationDomainError('FORBIDDEN');
        }
        if (!allowedInvitationRoles(actor.membership.role).includes(input.intended_role)) {
            throw new OrganizationDomainError('FORBIDDEN');
        }
        const email = normalizeOrganizationEmail(input.email);
        if (!this.invitationWorkflow || !this.identityProvisioning)
            throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
        const identity = await this.identityProvisioning.provision({ email, purpose: 'organization_invitee',
            request_id: actor.request_id, idempotency_key: `invite:${actor.organization.id}:${createHash('sha256').update(email).digest('hex').slice(0, 32)}` }, createInvitationProvisioningActor({ actor_type: 'organization_invitation', user_id: actor.user_id,
            membership_id: actor.membership.id, organization_id: actor.organization.id }));
        if (!identity.user_id || identity.outcome === 'blocked_ambiguous' || identity.outcome === 'blocked_ineligible') {
            throw new OrganizationDomainError('FORBIDDEN');
        }
        const token = createInvitationToken();
        const invitationId = randomUUID();
        const expiresAt = new Date(this.now().getTime() + INVITATION_EXPIRY_MILLISECONDS).toISOString();
        const persistence = {
            invitation_id: invitationId,
            organization_id: actor.organization.id,
            email_normalized: email,
            intended_role: input.intended_role,
            token_hash: token.token_hash,
            token_prefix: token.token_prefix,
            expires_at: expiresAt,
            invited_by_membership_id: actor.membership.id,
            invited_auth_user_id: identity.user_id,
            registration_permitted: identity.activation_required && identity.outcome === 'created_activation_required',
            request_id: actor.request_id,
        };
        const invitation = await this.repository.createInvitation(persistence);
        if (invitation.delivery_method === 'share_link')
            return this.invitationWorkflow.manualLink(invitation, token.raw_token);
        return this.invitationWorkflow.deliver(invitation, token.raw_token, {
            organization_display_name: actor.organization.display_name,
            inviter_display_name: validateDisplayName(input.inviter_display_name), request_id: actor.request_id
        });
    }
    async acceptInvitation(rawToken, identity) {
        return this.repository.acceptInvitation(rawToken, {
            ...identity,
            verified_email: normalizeOrganizationEmail(identity.verified_email),
        });
    }
    async resolveInvitation(rawToken) {
        if (rawToken.length < 32 || rawToken.length > 256)
            throw new OrganizationDomainError('INVITATION_INVALID');
        const resolution = await this.repository.resolveInvitation(rawToken);
        if (!resolution)
            throw new OrganizationDomainError('INVITATION_INVALID');
        return resolution;
    }
    async resendInvitation(invitationId, deliveryInput, actor) {
        if (!hasOrganizationCapability(actor.membership.role, actor.membership.status, actor.organization.status, 'members.invite')) {
            throw new OrganizationDomainError('FORBIDDEN');
        }
        const token = createInvitationToken();
        const replacementId = randomUUID();
        const expiresAt = new Date(this.now().getTime() + INVITATION_EXPIRY_MILLISECONDS).toISOString();
        const replacement = await this.repository.resendInvitation({
            organization_id: actor.organization.id,
            invitation_id: invitationId,
            replacement_invitation_id: replacementId,
            token_hash: token.token_hash,
            token_prefix: token.token_prefix,
            expires_at: expiresAt,
            actor_membership_id: actor.membership.id,
            request_id: actor.request_id,
        });
        if (!this.invitationWorkflow)
            throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
        await this.invitationWorkflow.invalidate(invitationId);
        if (replacement.delivery_method === 'share_link')
            return this.invitationWorkflow.manualLink(replacement, token.raw_token);
        return this.invitationWorkflow.deliver(replacement, token.raw_token, {
            organization_display_name: actor.organization.display_name,
            inviter_display_name: validateDisplayName(deliveryInput.inviter_display_name), request_id: actor.request_id
        });
    }
    async revokeInvitation(invitationId, actor) {
        if (!hasOrganizationCapability(actor.membership.role, actor.membership.status, actor.organization.status, 'members.invite')) {
            throw new OrganizationDomainError('FORBIDDEN');
        }
        const result = await this.repository.revokeInvitation({
            organization_id: actor.organization.id,
            invitation_id: invitationId,
            actor_membership_id: actor.membership.id,
            request_id: actor.request_id,
        });
        await this.invitationWorkflow?.invalidate(invitationId);
        return result;
    }
    async getPublicBranding(organizationId, organizationName) {
        const settings = await this.repository.getSettings(organizationId);
        if (!settings)
            throw new OrganizationDomainError('NOT_FOUND');
        return {
            display_name: settings.public_display_name ?? organizationName,
            primary_color: settings.primary_color,
            accent_color: settings.accent_color,
            logo_asset_id: null,
        };
    }
}
//# sourceMappingURL=organizationService.js.map