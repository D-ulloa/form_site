import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvitationDeliveryAdapter, InvitationDeliveryConfiguration } from './invitationDelivery.js';
import type { InvitationIdentityContext, OrganizationActorContext, OrganizationMembershipRecord } from './types.js';
import type { InvitationRecord, InvitationResolutionRecord } from './organizationRepository.js';
export interface InvitationDeliveryReceipt {
    readonly invitation_id: string;
    readonly status: string;
    readonly delivery_state: string;
    readonly delivery_method: 'share_link' | 'email';
    readonly expires_at: string;
    readonly next_action: 'copy_or_revoke' | 'wait' | 'resend_or_revoke';
    readonly share_url?: string;
}
export interface InvitationHandoffMaterial {
    readonly handle: string;
    readonly browser_binding: string;
    readonly max_age_seconds: number;
}
export interface InvitationWorkflowRepository {
    beginDelivery(input: {
        attempt_id: string;
        invitation_id: string;
        provider: 'resend' | 'capture';
        template_version: string;
        locale: string;
        idempotency_key: string;
        request_id: string;
    }): Promise<void>;
    completeDelivery(input: {
        attempt_id: string;
        state: string;
        provider_reference_hash: string | null;
        safe_error_code: string | null;
    }): Promise<void>;
    invalidateHandoffs(invitationId: string): Promise<void>;
    createHandoff(input: {
        raw_invitation_token: string;
        handle_hash: string;
        browser_binding_hash: string;
        origin_hash: string;
        expires_at: string;
    }): Promise<void>;
    resolveHandoff(input: {
        handle_hash: string;
        browser_binding_hash: string;
        origin_hash: string;
    }): Promise<InvitationResolutionRecord | null>;
    acceptHandoff(input: {
        handle_hash: string;
        browser_binding_hash: string;
        origin_hash: string;
        identity: InvitationIdentityContext;
    }): Promise<OrganizationMembershipRecord>;
    organizationSlug(organizationId: string): Promise<string>;
    recordWebhook(input: {
        event_id_hash: string;
        event_type: string;
        provider_reference_hash: string;
    }): Promise<boolean>;
    listMembers(organizationId: string, membershipId: string, cursor: string | null, limit: number): Promise<readonly Record<string, unknown>[]>;
    listInvitations(organizationId: string, membershipId: string, cursor: string | null, limit: number): Promise<readonly Record<string, unknown>[]>;
    registrationContext(input: {
        handle_hash: string;
        browser_binding_hash: string;
        origin_hash: string;
    }): Promise<{
        auth_user_id: string;
        email_normalized: string;
        registration_permitted: boolean;
    } | null>;
    completeRegistration(input: {
        handle_hash: string;
        browser_binding_hash: string;
        origin_hash: string;
        user_id: string;
        display_name: string;
        request_id: string;
    }): Promise<void>;
}
export declare function createInvitationWorkflowRepository(environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient): InvitationWorkflowRepository;
export declare class InvitationWorkflowService {
    private readonly repository;
    private readonly delivery;
    private readonly config;
    private readonly now;
    constructor(repository: InvitationWorkflowRepository, delivery: InvitationDeliveryAdapter, config: InvitationDeliveryConfiguration, now?: () => Date);
    invalidate(invitationId: string): Promise<void>;
    private acceptanceUrl;
    manualLink(invitation: InvitationRecord, rawToken: string): InvitationDeliveryReceipt;
    deliver(invitation: InvitationRecord, rawToken: string, input: {
        organization_display_name: string;
        inviter_display_name: string;
        request_id: string;
    }): Promise<InvitationDeliveryReceipt>;
    registrationContext(handle: string, binding: string, origin: string): Promise<{
        auth_user_id: string;
        email_normalized: string;
        registration_permitted: boolean;
    } | null>;
    completeRegistration(handle: string, binding: string, origin: string, userId: string, displayName: string, requestId: string): Promise<void>;
    createHandoff(rawToken: string, browserBinding: string | null, origin: string): Promise<InvitationHandoffMaterial>;
    resolveHandoff(handle: string, binding: string, origin: string): Promise<InvitationResolutionRecord | null>;
    acceptHandoff(handle: string, binding: string, origin: string, identity: InvitationIdentityContext): Promise<{
        membership: OrganizationMembershipRecord;
        organization_slug: string;
    }>;
    webhook(eventId: string, type: string, providerReference: string): Promise<boolean>;
    listMembers(actor: OrganizationActorContext, cursor: string | null): Promise<{
        items: {
            [x: string]: unknown;
        }[];
        next_cursor: string | null;
    }>;
    listInvitations(actor: OrganizationActorContext, cursor: string | null): Promise<{
        items: {
            [x: string]: unknown;
        }[];
        next_cursor: string | null;
    }>;
}
//# sourceMappingURL=invitationWorkflow.d.ts.map