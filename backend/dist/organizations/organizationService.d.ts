import type { IdentityProvisioningService } from '../identity/identityProvisioningService.js';
import type { OrganizationGovernanceRepository } from './organizationRepository.js';
import type { InvitationWorkflowService } from './invitationWorkflow.js';
import type { InvitationIdentityContext, OrganizationActorContext, OrganizationRecord, PlatformActorContext, PublicBranding } from './types.js';
export interface CreateOrganizationInput {
    /** Durable identifiers reserved by a trusted provisioning operation. */
    readonly organization_id?: string;
    readonly initial_owner_membership_id?: string;
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
    private readonly now;
    private readonly invitationWorkflow?;
    private readonly identityProvisioning?;
    constructor(repository: OrganizationGovernanceRepository, now?: () => Date, invitationWorkflow?: InvitationWorkflowService | undefined, identityProvisioning?: IdentityProvisioningService | undefined);
    createOrganization(input: CreateOrganizationInput, actor: PlatformActorContext): Promise<OrganizationRecord>;
    inviteMember(input: InviteMemberInput, actor: OrganizationActorContext): Promise<import("./invitationWorkflow.js").InvitationDeliveryReceipt>;
    acceptInvitation(rawToken: string, identity: InvitationIdentityContext): Promise<import("./types.js").OrganizationMembershipRecord>;
    resolveInvitation(rawToken: string): Promise<import("./organizationRepository.js").InvitationResolutionRecord>;
    resendInvitation(invitationId: string, deliveryInput: Omit<InviteMemberInput, 'email' | 'intended_role'>, actor: OrganizationActorContext): Promise<import("./invitationWorkflow.js").InvitationDeliveryReceipt>;
    revokeInvitation(invitationId: string, actor: OrganizationActorContext): Promise<import("./organizationRepository.js").InvitationRecord>;
    getPublicBranding(organizationId: string, organizationName: string): Promise<PublicBranding>;
}
//# sourceMappingURL=organizationService.d.ts.map