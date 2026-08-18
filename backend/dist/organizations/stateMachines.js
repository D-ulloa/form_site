import { OrganizationDomainError } from './errors.js';
const organizationTransitions = {
    active: ['suspended', 'pending_deletion'],
    suspended: ['active', 'pending_deletion'],
    pending_deletion: ['active', 'suspended', 'deleted'],
    deleted: [],
};
export function assertOrganizationTransition(current, next) {
    if (!organizationTransitions[current].includes(next)) {
        throw new OrganizationDomainError('FORBIDDEN', `Invalid organization transition: ${current} -> ${next}.`);
    }
}
export function assertMembershipTransition(current, next, reactivationByInvitation = false) {
    const allowed = current === 'active'
        ? next === 'suspended' || next === 'removed'
        : current === 'suspended'
            ? next === 'active' || next === 'removed'
            : reactivationByInvitation && next === 'active';
    if (!allowed)
        throw new OrganizationDomainError('FORBIDDEN', `Invalid membership transition: ${current} -> ${next}.`);
}
export function assertActiveOwnerRemains(memberships) {
    if (!memberships.some(({ role, status }) => role === 'owner' && status === 'active')) {
        throw new OrganizationDomainError('LAST_OWNER_REQUIRED');
    }
}
//# sourceMappingURL=stateMachines.js.map