import type { MembershipStatus, OrganizationRole, OrganizationStatus } from './types.js';
export declare function assertOrganizationTransition(current: OrganizationStatus, next: OrganizationStatus): void;
export declare function assertMembershipTransition(current: MembershipStatus, next: MembershipStatus, reactivationByInvitation?: boolean): void;
export declare function assertActiveOwnerRemains(memberships: readonly {
    readonly role: OrganizationRole;
    readonly status: MembershipStatus;
}[]): void;
//# sourceMappingURL=stateMachines.d.ts.map