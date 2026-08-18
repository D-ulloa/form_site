import { OrganizationDomainError } from './errors.js';
import type { MembershipStatus, OrganizationRole, OrganizationStatus } from './types.js';

const organizationTransitions: Readonly<Record<OrganizationStatus, readonly OrganizationStatus[]>> = {
  active: ['suspended', 'pending_deletion'],
  suspended: ['active', 'pending_deletion'],
  pending_deletion: ['active', 'suspended', 'deleted'],
  deleted: [],
};

export function assertOrganizationTransition(
  current: OrganizationStatus,
  next: OrganizationStatus,
): void {
  if (!organizationTransitions[current].includes(next)) {
    throw new OrganizationDomainError('FORBIDDEN', `Invalid organization transition: ${current} -> ${next}.`);
  }
}

export function assertMembershipTransition(
  current: MembershipStatus,
  next: MembershipStatus,
  reactivationByInvitation = false,
): void {
  const allowed = current === 'active'
    ? next === 'suspended' || next === 'removed'
    : current === 'suspended'
      ? next === 'active' || next === 'removed'
      : reactivationByInvitation && next === 'active';
  if (!allowed) throw new OrganizationDomainError('FORBIDDEN', `Invalid membership transition: ${current} -> ${next}.`);
}

export function assertActiveOwnerRemains(
  memberships: readonly { readonly role: OrganizationRole; readonly status: MembershipStatus }[],
): void {
  if (!memberships.some(({ role, status }) => role === 'owner' && status === 'active')) {
    throw new OrganizationDomainError('LAST_OWNER_REQUIRED');
  }
}

