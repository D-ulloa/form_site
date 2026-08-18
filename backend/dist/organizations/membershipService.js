import { OrganizationDomainError } from './errors.js';
import { canManageMembership, hasOrganizationCapability } from './roleCapabilities.js';
import { assertActiveOwnerRemains, assertMembershipTransition } from './stateMachines.js';
export class MembershipService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    assertWritableContext(actor) {
        if (actor.organization.status === 'suspended')
            throw new OrganizationDomainError('ORGANIZATION_SUSPENDED');
        if (actor.organization.status === 'pending_deletion')
            throw new OrganizationDomainError('ORGANIZATION_PENDING_DELETION');
        if (actor.organization.status !== 'active' || actor.membership.status !== 'active') {
            throw new OrganizationDomainError('FORBIDDEN');
        }
    }
    async changeRole(targetUserId, nextRole, expectedVersion, actor) {
        this.assertWritableContext(actor);
        const target = await this.repository.getMembership(actor.organization.id, targetUserId);
        if (!target)
            throw new OrganizationDomainError('NOT_FOUND');
        if (!canManageMembership(actor.membership.role, target.role) || target.user_id === actor.user_id) {
            throw new OrganizationDomainError('FORBIDDEN');
        }
        if (target.role === 'owner') {
            const owners = await this.repository.listActiveOwnersForUpdate(actor.organization.id);
            assertActiveOwnerRemains(owners.filter(({ id }) => id !== target.id));
        }
        return this.repository.changeRoleAtomic({
            organization_id: actor.organization.id,
            target_user_id: targetUserId,
            next_role: nextRole,
            expected_version: expectedVersion,
            actor_membership_id: actor.membership.id,
            request_id: actor.request_id,
        });
    }
    async changeStatus(targetUserId, nextStatus, expectedVersion, reasonCode, actor) {
        this.assertWritableContext(actor);
        if ((nextStatus === 'suspended' || nextStatus === 'removed') && !/^[a-z0-9_]{1,64}$/u.test(reasonCode)) {
            throw new OrganizationDomainError('FORBIDDEN', 'A safe reason code is required.');
        }
        const target = await this.repository.getMembership(actor.organization.id, targetUserId);
        if (!target)
            throw new OrganizationDomainError('NOT_FOUND');
        if (!canManageMembership(actor.membership.role, target.role) || target.user_id === actor.user_id) {
            throw new OrganizationDomainError('FORBIDDEN');
        }
        assertMembershipTransition(target.status, nextStatus);
        if (target.role === 'owner' && target.status === 'active' && nextStatus !== 'active') {
            const owners = await this.repository.listActiveOwnersForUpdate(actor.organization.id);
            assertActiveOwnerRemains(owners.filter(({ id }) => id !== target.id));
        }
        return this.repository.changeStatusAtomic({
            organization_id: actor.organization.id,
            target_user_id: targetUserId,
            next_status: nextStatus,
            expected_version: expectedVersion,
            reason_code: reasonCode,
            actor_membership_id: actor.membership.id,
            request_id: actor.request_id,
        });
    }
    async transferOwnership(targetUserId, sourceRoleAfter, expectedOrganizationVersion, expectedTargetMembershipVersion, confirmed, actor) {
        this.assertWritableContext(actor);
        if (!confirmed || !hasOrganizationCapability(actor.membership.role, actor.membership.status, actor.organization.status, 'members.transfer_ownership'))
            throw new OrganizationDomainError('FORBIDDEN');
        if (targetUserId === actor.user_id)
            throw new OrganizationDomainError('FORBIDDEN');
        const target = await this.repository.getMembership(actor.organization.id, targetUserId);
        if (!target || target.status !== 'active')
            throw new OrganizationDomainError('NOT_FOUND');
        return this.repository.transferOwnershipAtomic({
            organization_id: actor.organization.id,
            source_owner_membership_id: actor.membership.id,
            target_user_id: targetUserId,
            source_role_after: sourceRoleAfter,
            expected_organization_version: expectedOrganizationVersion,
            expected_target_membership_version: expectedTargetMembershipVersion,
            request_id: actor.request_id,
        });
    }
}
//# sourceMappingURL=membershipService.js.map