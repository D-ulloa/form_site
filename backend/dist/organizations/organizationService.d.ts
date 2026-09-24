import { type PersonalInvitationRepository } from './personalInvitationRepository.js';
import type { InvitationRecord } from './organizationRepository.js';
import type { IdentityProvisioningService } from '../identity/identityProvisioningService.js';
import type { OrganizationGovernanceRepository } from './organizationRepository.js';
import type { InvitationWorkflowService } from './invitationWorkflow.js';
import type { InvitationIdentityContext, OrganizationActorContext, OrganizationRecord, OrganizationRole, PlatformActorContext, PublicBranding } from './types.js';
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
    readonly arrangement_property_id?: string;
    readonly idempotency_key?: string;
    readonly email: string;
    readonly intended_role: Exclude<OrganizationRole, 'owner'>;
    readonly inviter_display_name: string;
    readonly public_base_url: string;
}
export declare class OrganizationService {
    private readonly repository;
    private readonly now;
    private readonly invitationWorkflow?;
    private readonly identityProvisioning?;
    private readonly personalRepository;
    private readonly environment;
    constructor(repository: OrganizationGovernanceRepository, now?: () => Date, invitationWorkflow?: InvitationWorkflowService | undefined, identityProvisioning?: IdentityProvisioningService | undefined, personalRepository?: PersonalInvitationRepository, environment?: NodeJS.ProcessEnv);
    createOrganization(input: CreateOrganizationInput, actor: PlatformActorContext): Promise<OrganizationRecord>;
    inviteMember(input: InviteMemberInput, actor: OrganizationActorContext): Promise<import("./invitationWorkflow.js").InvitationDeliveryReceipt>;
    acceptInvitation(rawToken: string, identity: InvitationIdentityContext): Promise<import("./types.js").OrganizationMembershipRecord>;
    invitePersonal(input: {
        email: string;
        idempotency_key: string;
    }, actor: OrganizationActorContext): Promise<import("./invitationWorkflow.js").InvitationDeliveryReceipt>;
    private personalReceipt;
    rotatePersonalInvitation(invitationId: string, actor: OrganizationActorContext): Promise<import("./invitationWorkflow.js").InvitationDeliveryReceipt>;
    revokePersonalInvitation(invitationId: string, actor: OrganizationActorContext): Promise<{
        invitation_id: string;
        status: "revoked" | "pending" | "accepted" | "replaced";
        version: number;
    }>;
    resolveInvitation(rawToken: string): Promise<import("./organizationRepository.js").InvitationResolutionRecord>;
    resendInvitation(invitationId: string, deliveryInput: Omit<InviteMemberInput, 'email' | 'intended_role'>, actor: OrganizationActorContext): Promise<import("./invitationWorkflow.js").InvitationDeliveryReceipt>;
    revokeInvitation(invitationId: string, actor: OrganizationActorContext): Promise<InvitationRecord>;
    getPublicBranding(organizationId: string, organizationName: string): Promise<PublicBranding>;
}
//# sourceMappingURL=organizationService.d.ts.map