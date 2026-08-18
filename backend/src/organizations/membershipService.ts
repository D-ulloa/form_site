import { OrganizationDomainError } from './errors.js';
import { canManageMembership, hasOrganizationCapability } from './roleCapabilities.js';
import { assertActiveOwnerRemains, assertMembershipTransition } from './stateMachines.js';
import type {
  OrganizationActorContext,
  OrganizationMembershipRecord,
  OrganizationRole,
} from './types.js';

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

export class MembershipService {
  constructor(private readonly repository: MembershipMutationRepository) {}

  private assertWritableContext(actor: OrganizationActorContext): void {
    if (actor.organization.status === 'suspended') throw new OrganizationDomainError('ORGANIZATION_SUSPENDED');
    if (actor.organization.status === 'pending_deletion') throw new OrganizationDomainError('ORGANIZATION_PENDING_DELETION');
    if (actor.organization.status !== 'active' || actor.membership.status !== 'active') {
      throw new OrganizationDomainError('FORBIDDEN');
    }
  }

  async changeRole(
    targetUserId: string,
    nextRole: Exclude<OrganizationRole, 'owner'>,
    expectedVersion: number,
    actor: OrganizationActorContext,
  ): Promise<OrganizationMembershipRecord> {
    this.assertWritableContext(actor);
    const target = await this.repository.getMembership(actor.organization.id, targetUserId);
    if (!target) throw new OrganizationDomainError('NOT_FOUND');
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

  async changeStatus(
    targetUserId: string,
    nextStatus: 'active' | 'suspended' | 'removed',
    expectedVersion: number,
    reasonCode: string,
    actor: OrganizationActorContext,
  ): Promise<OrganizationMembershipRecord> {
    this.assertWritableContext(actor);
    if ((nextStatus === 'suspended' || nextStatus === 'removed') && !/^[a-z0-9_]{1,64}$/u.test(reasonCode)) {
      throw new OrganizationDomainError('FORBIDDEN', 'A safe reason code is required.');
    }
    const target = await this.repository.getMembership(actor.organization.id, targetUserId);
    if (!target) throw new OrganizationDomainError('NOT_FOUND');
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

  async transferOwnership(
    targetUserId: string,
    sourceRoleAfter: OrganizationRole,
    expectedOrganizationVersion: number,
    expectedTargetMembershipVersion: number,
    confirmed: boolean,
    actor: OrganizationActorContext,
  ): Promise<readonly OrganizationMembershipRecord[]> {
    this.assertWritableContext(actor);
    if (!confirmed || !hasOrganizationCapability(
      actor.membership.role, actor.membership.status, actor.organization.status, 'members.transfer_ownership',
    )) throw new OrganizationDomainError('FORBIDDEN');
    if (targetUserId === actor.user_id) throw new OrganizationDomainError('FORBIDDEN');
    const target = await this.repository.getMembership(actor.organization.id, targetUserId);
    if (!target || target.status !== 'active') throw new OrganizationDomainError('NOT_FOUND');
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
