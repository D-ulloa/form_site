import type { OrganizationActorContext, OrganizationMembershipRecord, OrganizationRole } from './types.js';
export interface MembershipMutationRepository {
    getMembership(organizationId: string, userId: string): Promise<OrganizationMembershipRecord | null>;
    listActiveOwnersForUpdate(organizationId: string): Promise<readonly OrganizationMembershipRecord[]>;
    changeRoleAtomic(input: {
        organization_id: string;
        target_user_id: string;
        next_role: Exclude<OrganizationRole, 'owner'>;
        expected_version: number;
        actor_membership_id: string;
        request_id: string;
    }): Promise<OrganizationMembershipRecord>;
    changeStatusAtomic(input: {
        organization_id: string;
        target_user_id: string;
        next_status: 'active' | 'suspended' | 'removed';
        expected_version: number;
        reason_code: string;
        actor_membership_id: string;
        request_id: string;
    }): Promise<OrganizationMembershipRecord>;
    transferOwnershipAtomic(input: {
        organization_id: string;
        source_owner_membership_id: string;
        target_user_id: string;
        source_role_after: OrganizationRole;
        expected_organization_version: number;
        expected_target_membership_version: number;
        request_id: string;
    }): Promise<readonly OrganizationMembershipRecord[]>;
}
export declare class MembershipService {
    private readonly repository;
    constructor(repository: MembershipMutationRepository);
    private assertWritableContext;
    changeRole(targetUserId: string, nextRole: Exclude<OrganizationRole, 'owner'>, expectedVersion: number, actor: OrganizationActorContext): Promise<OrganizationMembershipRecord>;
    changeStatus(targetUserId: string, nextStatus: 'active' | 'suspended' | 'removed', expectedVersion: number, reasonCode: string, actor: OrganizationActorContext): Promise<OrganizationMembershipRecord>;
    transferOwnership(targetUserId: string, sourceRoleAfter: OrganizationRole, expectedOrganizationVersion: number, expectedTargetMembershipVersion: number, confirmed: boolean, actor: OrganizationActorContext): Promise<readonly OrganizationMembershipRecord[]>;
}
//# sourceMappingURL=membershipService.d.ts.map