import type { SupabaseClient } from '@supabase/supabase-js';
import type { IdentityProfileState, IdentityProvisioningActor, IdentityProvisioningOutcome, IdentityProvisioningPurpose } from './identityProvisioningTypes.js';
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
export declare function createIdentityProvisioningRepository(environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient): IdentityProvisioningRepository;
//# sourceMappingURL=identityProvisioningRepository.d.ts.map