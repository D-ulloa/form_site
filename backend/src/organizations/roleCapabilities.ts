import type {
  MembershipStatus,
  OrganizationCapability,
  OrganizationRole,
  OrganizationStatus,
} from './types.js';

export const ROLE_CAPABILITY_REGISTRY_VERSION = 1 as const;

const capabilities = {
  owner: [
    'organization.read', 'organization.update_settings', 'organization.request_deletion',
    'organization.cancel_deletion', 'organization.export', 'members.read', 'members.invite',
    'members.manage_member', 'members.manage_admin', 'members.transfer_ownership',
    'contracts.read', 'contracts.write', 'contracts.manage', 'contracts.manage_links',
    'properties.read', 'properties.write', 'properties.manage', 'files.read',
    'integrations.read', 'integrations.manage', 'audit.read', 'billing.read', 'billing.manage',
  ],
  admin: [
    'organization.read', 'organization.update_settings', 'members.read', 'members.invite',
    'members.manage_member', 'contracts.read', 'contracts.write', 'contracts.manage',
    'contracts.manage_links', 'properties.read', 'properties.write', 'properties.manage',
    'files.read', 'integrations.read', 'audit.read',
  ],
  member: [
    'organization.read', 'contracts.read', 'contracts.write', 'properties.read',
    'properties.write', 'files.read',
  ],
  viewer: ['organization.read', 'contracts.read', 'properties.read'],
} as const satisfies Record<OrganizationRole, readonly OrganizationCapability[]>;

export const ROLE_CAPABILITIES: Readonly<Record<OrganizationRole, ReadonlySet<OrganizationCapability>>> = {
  owner: new Set(capabilities.owner),
  admin: new Set(capabilities.admin),
  member: new Set(capabilities.member),
  viewer: new Set(capabilities.viewer),
};

export function isOrganizationRole(value: string): value is OrganizationRole {
  return value === 'owner' || value === 'admin' || value === 'member' || value === 'viewer';
}

export function hasOrganizationCapability(
  role: string,
  membershipStatus: MembershipStatus,
  organizationStatus: OrganizationStatus,
  capability: OrganizationCapability,
): boolean {
  if (!isOrganizationRole(role) || membershipStatus !== 'active') return false;
  if (organizationStatus === 'deleted' || organizationStatus === 'pending_deletion') {
    return false;
  }
  if (organizationStatus === 'suspended') {
    return role === 'owner' && (capability === 'organization.read' || capability === 'organization.export');
  }
  return ROLE_CAPABILITIES[role].has(capability);
}

export function allowedInvitationRoles(role: string): readonly Exclude<OrganizationRole, 'owner'>[] {
  if (role === 'owner') return ['admin', 'member', 'viewer'];
  if (role === 'admin') return ['member', 'viewer'];
  return [];
}

export function canManageMembership(
  actorRole: string,
  targetRole: OrganizationRole,
): boolean {
  return actorRole === 'owner' || (actorRole === 'admin' && (targetRole === 'member' || targetRole === 'viewer'));
}

