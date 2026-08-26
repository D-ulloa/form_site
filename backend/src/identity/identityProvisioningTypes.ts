export type IdentityProvisioningPurpose = 'initial_owner' | 'organization_invitee';

export type IdentityProvisioningOutcome =
  | 'existing_active'
  | 'existing_activation_required'
  | 'created_activation_required'
  | 'reconciled_after_ambiguity'
  | 'blocked_ambiguous'
  | 'blocked_ineligible';

export type IdentityProfileState = 'created' | 'existing';

export interface ProvisionIdentityInput {
  readonly email: string;
  readonly display_name?: string;
  readonly locale?: string;
  readonly time_zone?: string;
  readonly purpose: IdentityProvisioningPurpose;
  readonly request_id: string;
  readonly idempotency_key: string;
}

declare const trustedProvisioningActor: unique symbol;

export interface PlatformProvisioningActor {
  readonly actor_type: 'platform_operator';
  readonly user_id: string;
  readonly assurance_level: 'aal2';
  readonly step_up_reference: string;
  readonly [trustedProvisioningActor]: true;
}

export interface InvitationProvisioningActor {
  readonly actor_type: 'organization_invitation';
  readonly user_id: string;
  readonly membership_id: string;
  readonly organization_id: string;
  readonly [trustedProvisioningActor]: true;
}

export type IdentityProvisioningActor = PlatformProvisioningActor | InvitationProvisioningActor;

/** Trusted authentication/authorization code is the only intended caller of these factories. */
export function createPlatformProvisioningActor(input: Omit<PlatformProvisioningActor, typeof trustedProvisioningActor>): PlatformProvisioningActor {
  return Object.freeze(input) as PlatformProvisioningActor;
}

export function createInvitationProvisioningActor(input: Omit<InvitationProvisioningActor, typeof trustedProvisioningActor>): InvitationProvisioningActor {
  return Object.freeze(input) as InvitationProvisioningActor;
}

export interface ProvisionIdentityResult {
  readonly user_id: string | null;
  readonly email_normalized: string;
  readonly outcome: IdentityProvisioningOutcome;
  readonly profile_state: IdentityProfileState | null;
  readonly activation_required: boolean;
  readonly provider_reconciliation_reference: string | null;
  readonly idempotency: 'created' | 'resumed' | 'replayed';
}

export type IdentityProvisioningErrorCode =
  | 'IDENTITY_AMBIGUOUS'
  | 'IDENTITY_INELIGIBLE'
  | 'PROFILE_CONFLICT'
  | 'IDENTITY_PROVIDER_UNAVAILABLE'
  | 'AUDIT_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PROVISIONING_IN_PROGRESS'
  | 'PROVISIONING_DISABLED'
  | 'FORBIDDEN';

export class IdentityProvisioningError extends Error {
  readonly status: number;

  constructor(readonly code: IdentityProvisioningErrorCode) {
    super(code);
    this.name = 'IdentityProvisioningError';
    this.status = {
      IDENTITY_AMBIGUOUS: 409,
      IDENTITY_INELIGIBLE: 403,
      PROFILE_CONFLICT: 409,
      IDENTITY_PROVIDER_UNAVAILABLE: 503,
      AUDIT_UNAVAILABLE: 503,
      IDEMPOTENCY_CONFLICT: 409,
      PROVISIONING_IN_PROGRESS: 409,
      PROVISIONING_DISABLED: 503,
      FORBIDDEN: 403,
    }[code];
  }
}
