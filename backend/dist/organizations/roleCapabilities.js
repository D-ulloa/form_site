export const ROLE_CAPABILITY_REGISTRY_VERSION = 1;
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
};
export const ROLE_CAPABILITIES = {
    owner: new Set(capabilities.owner),
    admin: new Set(capabilities.admin),
    member: new Set(capabilities.member),
    viewer: new Set(capabilities.viewer),
};
export function isOrganizationRole(value) {
    return value === 'owner' || value === 'admin' || value === 'member' || value === 'viewer';
}
export function hasOrganizationCapability(role, membershipStatus, organizationStatus, capability) {
    if (!isOrganizationRole(role) || membershipStatus !== 'active')
        return false;
    if (organizationStatus === 'deleted' || organizationStatus === 'pending_deletion') {
        return false;
    }
    if (organizationStatus === 'suspended') {
        return role === 'owner' && (capability === 'organization.read' || capability === 'organization.export');
    }
    return ROLE_CAPABILITIES[role].has(capability);
}
export function allowedInvitationRoles(role) {
    if (role === 'owner')
        return ['admin', 'member', 'viewer'];
    if (role === 'admin')
        return ['member', 'viewer'];
    return [];
}
export function canManageMembership(actorRole, targetRole) {
    return actorRole === 'owner' || (actorRole === 'admin' && (targetRole === 'member' || targetRole === 'viewer'));
}
//# sourceMappingURL=roleCapabilities.js.map