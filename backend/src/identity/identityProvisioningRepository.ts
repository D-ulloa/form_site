import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import type {
  IdentityProfileState, IdentityProvisioningActor, IdentityProvisioningOutcome,
  IdentityProvisioningPurpose,
} from './identityProvisioningTypes.js';
import { IdentityProvisioningError } from './identityProvisioningTypes.js';

export interface ProvisioningOperationRecord {
  readonly operation_id: string;
  readonly claim_state: 'created' | 'resumed' | 'replayed' | 'busy' | 'blocked_inventory';
  readonly state: 'processing' | 'provider_ambiguous' | 'completed' | 'blocked';
  readonly outcome: IdentityProvisioningOutcome | null;
  readonly auth_user_id: string | null;
  readonly profile_state: IdentityProfileState | null;
  readonly activation_required: boolean | null;
  readonly provider_reconciliation_reference: string | null;
  readonly provider_ambiguity_phase: 'resolve' | 'create' | null;
}

export interface IdentityProvisioningRepository {
  assertActor(actor: IdentityProvisioningActor, purpose: IdentityProvisioningPurpose): Promise<void>;
  claim(input: {
    readonly idempotency_key: string;
    readonly payload_fingerprint: string;
    readonly email_fingerprint: string;
    readonly purpose: IdentityProvisioningPurpose;
    readonly request_id: string;
    readonly actor: IdentityProvisioningActor;
  }): Promise<ProvisioningOperationRecord>;
  markProviderAmbiguous(operationId: string, phase: 'resolve' | 'create', requestId: string): Promise<void>;
  complete(input: {
    readonly operation_id: string;
    readonly user_id: string;
    readonly display_name: string;
    readonly locale: string;
    readonly time_zone: string;
    readonly outcome: Exclude<IdentityProvisioningOutcome, 'blocked_ambiguous' | 'blocked_ineligible'>;
    readonly activation_required: boolean;
    readonly reconciliation_reference: string;
    readonly request_id: string;
  }): Promise<ProvisioningOperationRecord>;
  block(input: {
    readonly operation_id: string;
    readonly outcome: 'blocked_ambiguous' | 'blocked_ineligible';
    readonly reason_code: 'IDENTITY_AMBIGUOUS' | 'IDENTITY_INELIGIBLE';
    readonly request_id: string;
    readonly reconciliation_reference: string;
  }): Promise<ProvisioningOperationRecord>;
}

function row(data: unknown, error: { message: string } | null): ProvisioningOperationRecord {
  if (error || !data) {
    const message = error?.message ?? '';
    if (message.includes('IDEMPOTENCY_CONFLICT')) throw new IdentityProvisioningError('IDEMPOTENCY_CONFLICT');
    if (message.includes('PROFILE_CONFLICT')) throw new IdentityProvisioningError('PROFILE_CONFLICT');
    if (message.includes('AUDIT_UNAVAILABLE')) throw new IdentityProvisioningError('AUDIT_UNAVAILABLE');
    throw new IdentityProvisioningError('AUDIT_UNAVAILABLE');
  }
  return data as ProvisioningOperationRecord;
}

export function createIdentityProvisioningRepository(
  environment: NodeJS.ProcessEnv = process.env,
  clientOverride?: SupabaseClient,
): IdentityProvisioningRepository {
  const client = clientOverride ?? createPlatformServiceRoleClient(environment);
  return {
    async assertActor(actor, purpose) {
      if (actor.actor_type === 'platform_operator') {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(actor.step_up_reference)) {
          throw new IdentityProvisioningError('FORBIDDEN');
        }
        const now = new Date().toISOString();
        const [{ data, error }, { data: session, error: sessionError }] = await Promise.all([
          client.from('platform_operators').select('status,mfa_required').eq('user_id', actor.user_id).maybeSingle(),
          client.from('app_sessions').select('id').eq('id', actor.step_up_reference)
            .eq('user_id', actor.user_id).eq('assurance_level', 'aal2').is('revoked_at', null)
            .gt('absolute_expires_at', now).or(`idle_expires_at.is.null,idle_expires_at.gt.${now}`).maybeSingle(),
        ]);
        if (error || sessionError || !session || data?.status !== 'active' || data.mfa_required !== true
          || actor.assurance_level !== 'aal2') throw new IdentityProvisioningError('FORBIDDEN');
        return;
      }
      if (purpose !== 'organization_invitee') throw new IdentityProvisioningError('FORBIDDEN');
      const { data, error } = await client.from('organization_memberships').select('id')
        .eq('id', actor.membership_id).eq('organization_id', actor.organization_id)
        .eq('user_id', actor.user_id).eq('status', 'active').in('role', ['owner', 'admin']).maybeSingle();
      if (error || !data) throw new IdentityProvisioningError('FORBIDDEN');
    },

    async claim(input) {
      const { data, error } = await client.rpc('spec35_claim_identity_provisioning', {
        p_idempotency_key: input.idempotency_key,
        p_payload_fingerprint: input.payload_fingerprint,
        p_email_fingerprint: input.email_fingerprint,
        p_purpose: input.purpose,
        p_request_id: input.request_id,
        p_actor_type: input.actor.actor_type,
        p_actor_user_id: input.actor.user_id,
        p_actor_membership_id: input.actor.actor_type === 'organization_invitation' ? input.actor.membership_id : null,
        p_step_up_session_id: input.actor.actor_type === 'platform_operator' ? input.actor.step_up_reference : null,
      }).single();
      return row(data, error);
    },

    async markProviderAmbiguous(operationId, phase, requestId) {
      const { error } = await client.rpc('spec35_mark_provider_ambiguous', {
        p_operation_id: operationId, p_ambiguity_phase: phase, p_request_id: requestId,
      });
      if (error) throw new IdentityProvisioningError('AUDIT_UNAVAILABLE');
    },

    async complete(input) {
      const { data, error } = await client.rpc('spec35_complete_identity_provisioning', {
        p_operation_id: input.operation_id,
        p_user_id: input.user_id,
        p_display_name: input.display_name,
        p_locale: input.locale,
        p_time_zone: input.time_zone,
        p_outcome: input.outcome,
        p_activation_required: input.activation_required,
        p_reconciliation_reference: input.reconciliation_reference,
        p_request_id: input.request_id,
      }).single();
      return row(data, error);
    },

    async block(input) {
      const { data, error } = await client.rpc('spec35_block_identity_provisioning', {
        p_operation_id: input.operation_id,
        p_outcome: input.outcome,
        p_reason_code: input.reason_code,
        p_reconciliation_reference: input.reconciliation_reference,
        p_request_id: input.request_id,
      }).single();
      return row(data, error);
    },
  };
}
