import { randomUUID } from 'node:crypto';
import { OrganizationDomainError } from './errors.js';
import { createInvitationToken } from './invitationTokens.js';
import type {
  CreateInvitationPersistenceInput,
  OrganizationGovernanceRepository,
} from './organizationRepository.js';
import { allowedInvitationRoles, hasOrganizationCapability } from './roleCapabilities.js';
import type {
  InvitationIdentityContext,
  OrganizationActorContext,
  OrganizationRecord,
  PlatformActorContext,
  PublicBranding,
} from './types.js';
import {
  normalizeOrganizationEmail,
  validateDisplayName,
  validateLocale,
  validateOrganizationSlug,
  validateTimeZone,
} from './validation.js';

const INVITATION_EXPIRY_MILLISECONDS = 72 * 60 * 60 * 1000;
const PLAN_KEYS = new Set(['internal', 'standard', 'enterprise']);

function buildAcceptanceUrl(publicBaseUrl: string, rawToken: string): string {
  let url: URL;
  try {
    url = new URL('/invitations/accept', publicBaseUrl);
  } catch {
    throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Invitation public base URL is invalid.');
  }
  if (url.protocol !== 'https:') {
    throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Invitation public base URL must use HTTPS.');
  }
  url.hash = `invitation_token=${rawToken}`;
  return url.toString();
}

export interface InvitationDeliveryMessage {
  readonly invitation_id: string;
  readonly organization_display_name: string;
  readonly inviter_display_name: string;
  readonly intended_role: 'admin' | 'member' | 'viewer';
  readonly email_normalized: string;
  readonly expires_at: string;
  readonly acceptance_url: string;
}

export interface InvitationDeliveryAdapter {
  send(message: InvitationDeliveryMessage): Promise<void>;
}

export class DisabledInvitationDeliveryAdapter implements InvitationDeliveryAdapter {
  async send(_message: InvitationDeliveryMessage): Promise<void> {
    throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Invitation delivery provider is not configured.');
  }
}

export class FakeInvitationDeliveryAdapter implements InvitationDeliveryAdapter {
  readonly messages: InvitationDeliveryMessage[] = [];
  async send(message: InvitationDeliveryMessage): Promise<void> {
    this.messages.push(message);
  }
}

export interface CreateOrganizationInput {
  readonly slug: string;
  readonly display_name: string;
  readonly legal_name?: string | null;
  readonly plan_key: string;
  readonly locale: string;
  readonly time_zone: string;
  readonly creation_source: 'platform' | 'migration';
  readonly initial_owner_user_id: string;
}

export interface InviteMemberInput {
  readonly email: string;
  readonly intended_role: 'admin' | 'member' | 'viewer';
  readonly inviter_display_name: string;
  readonly public_base_url: string;
}

export class OrganizationService {
  constructor(
    private readonly repository: OrganizationGovernanceRepository,
    private readonly delivery: InvitationDeliveryAdapter = new DisabledInvitationDeliveryAdapter(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createOrganization(
    input: CreateOrganizationInput,
    actor: PlatformActorContext,
  ): Promise<OrganizationRecord> {
    if (!PLAN_KEYS.has(input.plan_key)) throw new OrganizationDomainError('FORBIDDEN', 'Unknown server plan key.');
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

  async inviteMember(input: InviteMemberInput, actor: OrganizationActorContext): Promise<{ readonly invitation_id: string }> {
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
    const persistence: CreateInvitationPersistenceInput = {
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
    } catch (error) {
      await this.repository.markInvitationDelivery(invitationId, 'failed',
        error instanceof OrganizationDomainError ? error.code : 'DELIVERY_FAILED');
    }
    return { invitation_id: invitationId };
  }

  async acceptInvitation(rawToken: string, identity: InvitationIdentityContext) {
    return this.repository.acceptInvitation(rawToken, {
      ...identity,
      verified_email: normalizeOrganizationEmail(identity.verified_email),
    });
  }

  async resolveInvitation(rawToken: string) {
    if (rawToken.length < 32 || rawToken.length > 256) throw new OrganizationDomainError('INVITATION_INVALID');
    const resolution = await this.repository.resolveInvitation(rawToken);
    if (!resolution) throw new OrganizationDomainError('INVITATION_INVALID');
    return resolution;
  }

  async resendInvitation(
    invitationId: string,
    deliveryInput: Omit<InviteMemberInput, 'email' | 'intended_role'>,
    actor: OrganizationActorContext,
  ): Promise<{ readonly invitation_id: string }> {
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
    } catch (error) {
      await this.repository.markInvitationDelivery(replacementId, 'failed',
        error instanceof OrganizationDomainError ? error.code : 'DELIVERY_FAILED');
    }
    return { invitation_id: replacementId };
  }

  async revokeInvitation(invitationId: string, actor: OrganizationActorContext) {
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

  async getPublicBranding(organizationId: string, organizationName: string): Promise<PublicBranding> {
    const settings = await this.repository.getSettings(organizationId);
    if (!settings) throw new OrganizationDomainError('NOT_FOUND');
    return {
      display_name: settings.public_display_name ?? organizationName,
      primary_color: settings.primary_color,
      accent_color: settings.accent_color,
      logo_asset_id: null,
    };
  }
}
