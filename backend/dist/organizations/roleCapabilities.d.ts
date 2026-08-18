import type { MembershipStatus, OrganizationCapability, OrganizationRole, OrganizationStatus } from './types.js';
export declare const ROLE_CAPABILITY_REGISTRY_VERSION: 1;
export declare const ROLE_CAPABILITIES: Readonly<Record<OrganizationRole, ReadonlySet<OrganizationCapability>>>;
export declare function isOrganizationRole(value: string): value is OrganizationRole;
export declare function hasOrganizationCapability(role: string, membershipStatus: MembershipStatus, organizationStatus: OrganizationStatus, capability: OrganizationCapability): boolean;
export declare function allowedInvitationRoles(role: string): readonly Exclude<OrganizationRole, 'owner'>[];
export declare function canManageMembership(actorRole: string, targetRole: OrganizationRole): boolean;
//# sourceMappingURL=roleCapabilities.d.ts.map