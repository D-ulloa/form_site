import { randomUUID } from 'node:crypto';
import { OrganizationDomainError } from './errors.js';
import { createInvitationToken } from './invitationTokens.js';
import { allowedInvitationRoles, hasOrganizationCapability } from './roleCapabilities.js';
import { normalizeOrganizationEmail, validateDisplayName, validateLocale, validateOrganizationSlug, validateTimeZone, } from './validation.js';
const INVITATION_EXPIRY_MILLISECONDS = 72 * 60 * 60 * 1000;
const PLAN_KEYS = new Set(['internal', 'standard', 'enterprise']);
function buildAcceptanceUrl(publicBaseUrl, rawToken) {
    let url;
    try {
        url = new URL('/invitations/accept', publicBaseUrl);
    }
    catch {
        throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Invitation public base URL is invalid.');
    }
    if (url.protocol !== 'https:') {
        throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Invitation public base URL must use HTTPS.');
    }
    url.hash = `invitation_token=${rawToken}`;
    return url.toString();
}
export class DisabledInvitationDeliveryAdapter {
    async send(_message) {
        throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Invitation delivery provider is not configured.');
    }
}
export class FakeInvitationDeliveryAdapter {
    messages = [];
    async send(message) {
        this.messages.push(message);
    }
}
export class OrganizationService {
    repository;
    delivery;
    now;
    constructor(repository, delivery = new DisabledInvitationDeliveryAdapter(), now = () => new Date()) {
        this.repository = repository;
        this.delivery = delivery;
        this.now = now;
    }
    async createOrganization(input, actor) {
        if (!PLAN_KEYS.has(input.plan_key))
            throw new OrganizationDomainError('FORBIDDEN', 'Unknown server plan key.');
        return this.repository.createOrganization({
            organization_id: randomUUID(),
            slug: validateOrganizationSlug(input.slug),
            display_name: validateDisplayName(input.display_name),
            legal_name: input.legal_name ? validateDisplayName(input.legal_name, 240) : null,
            plan_key: input.plan_key,
            locale: validateLocale(input.locale),
            time_zone: validateTimeZone(input.time_zone),
            creation_source: input.creation_source,
            initial_owner_user_id: input.initial_owner_user_id,
            initial_owner_membership_id: randomUUID(),
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
            request_id: actor.request_id,
        };
        await this.repository.createInvitation(persistence);
        try {
            await this.delivery.send({
                invitation_id: invitationId,
                organization_display_name: actor.organization.display_name,
                inviter_display_name: validateDisplayName(input.inviter_display_name),
                intended_role: input.intended_role,
                email_normalized: email,
                expires_at: expiresAt,
                acceptance_url: buildAcceptanceUrl(input.public_base_url, token.raw_token),
            });
            await this.repository.markInvitationDelivery(invitationId, 'sent');
        }
        catch (error) {
            await this.repository.markInvitationDelivery(invitationId, 'failed', error instanceof OrganizationDomainError ? error.code : 'DELIVERY_FAILED');
        }
        return { invitation_id: invitationId };
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
        try {
            await this.delivery.send({
                invitation_id: replacementId,
                organization_display_name: actor.organization.display_name,
                inviter_display_name: validateDisplayName(deliveryInput.inviter_display_name),
                intended_role: replacement.intended_role,
                email_normalized: replacement.email_normalized,
                expires_at: expiresAt,
                acceptance_url: buildAcceptanceUrl(deliveryInput.public_base_url, token.raw_token),
            });
            await this.repository.markInvitationDelivery(replacementId, 'sent');
        }
        catch (error) {
            await this.repository.markInvitationDelivery(replacementId, 'failed', error instanceof OrganizationDomainError ? error.code : 'DELIVERY_FAILED');
        }
        return { invitation_id: replacementId };
    }
    async revokeInvitation(invitationId, actor) {
        if (!hasOrganizationCapability(actor.membership.role, actor.membership.status, actor.organization.status, 'members.invite')) {
            throw new OrganizationDomainError('FORBIDDEN');
        }
        return this.repository.revokeInvitation({
            organization_id: actor.organization.id,
            invitation_id: invitationId,
            actor_membership_id: actor.membership.id,
            request_id: actor.request_id,
        });
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