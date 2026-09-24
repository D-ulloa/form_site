import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvitationRecord } from './organizationRepository.js';
interface Scope {
    organization_id: string;
    actor_membership_id: string;
}
interface Token {
    token_hash: string;
    token_prefix: string;
    expires_at: string;
    request_id: string;
}
export interface PersonalInvitationRepository {
    prepare(input: Scope & {
        email: string;
        idempotency_key: string;
    }): Promise<{
        operation_id: string;
        invitation: InvitationRecord | null;
    }>;
    create(input: Scope & Token & {
        operation_id: string;
        email: string;
        invited_auth_user_id: string;
        registration_permitted: boolean;
        delivery_method: 'share_link' | 'email';
    }): Promise<InvitationRecord>;
    rotate(input: Scope & Token & {
        invitation_id: string;
        replacement_invitation_id: string;
    }): Promise<InvitationRecord>;
    revoke(input: Scope & {
        invitation_id: string;
        request_id: string;
    }): Promise<InvitationRecord>;
}
export declare function createPersonalInvitationRepository(environment?: NodeJS.ProcessEnv, override?: SupabaseClient): PersonalInvitationRepository;
export {};
//# sourceMappingURL=personalInvitationRepository.d.ts.map