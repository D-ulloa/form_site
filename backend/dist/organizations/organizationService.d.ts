import type { OrganizationGovernanceRepository } from './organizationRepository.js';
import type { InvitationIdentityContext, OrganizationActorContext, OrganizationRecord, PlatformActorContext, PublicBranding } from './types.js';
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
export declare class DisabledInvitationDeliveryAdapter implements InvitationDeliveryAdapter {
    send(_message: InvitationDeliveryMessage): Promise<void>;
}
export declare class FakeInvitationDeliveryAdapter implements InvitationDeliveryAdapter {
    readonly messages: InvitationDeliveryMessage[];
    send(message: InvitationDeliveryMessage): Promise<void>;
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
export declare class OrganizationService {
    private readonly repository;
    private readonly delivery;
    private readonly now;
    constructor(repository: OrganizationGovernanceRepository, delivery?: InvitationDeliveryAdapter, now?: () => Date);
    createOrganization(input: CreateOrganizationInput, actor: PlatformActorContext): Promise<OrganizationRecord>;
    inviteMember(input: InviteMemberInput, actor: OrganizationActorContext): Promise<{
        readonly invitation_id: string;
    }>;
    acceptInvitation(rawToken: string, identity: InvitationIdentityContext): Promise<import("./types.js").OrganizationMembershipRecord>;
    resolveInvitation(rawToken: string): Promise<import("./organizationRepository.js").InvitationResolutionRecord>;
    resendInvitation(invitationId: string, deliveryInput: Omit<InviteMemberInput, 'email' | 'intended_role'>, actor: OrganizationActorContext): Promise<{
        readonly invitation_id: string;
    }>;
    revokeInvitation(invitationId: string, actor: OrganizationActorContext): Promise<import("./organizationRepository.js").InvitationRecord>;
    getPublicBranding(organizationId: string, organizationName: string): Promise<PublicBranding>;
}
//# sourceMappingURL=organizationService.d.ts.map