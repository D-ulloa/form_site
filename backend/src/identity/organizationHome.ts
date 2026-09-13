import type { OrganizationRequestContext } from './types.js';

/** Minimal browser projection. Organization records contain administrative metadata. */
export function publicOrganizationContext(context: OrganizationRequestContext) {
  const { organization, membership, capabilities } = context;
  const homeDestination = membership.role === 'personal'
    ? capabilities.has('personal.home.read') ? 'personal' : null
    : membership.role === 'inquilino'
    ? capabilities.has('inquilino.home.read') ? 'inquilino' : null
    : capabilities.has('organization.read') ? 'organization' : null;
  return {
    organization: { id: organization.id, slug: organization.slug,
      display_name: organization.display_name, status: organization.status },
    membership: { id: membership.id, organization_id: membership.organization_id,
      user_id: membership.user_id, role: membership.role, status: membership.status, version: membership.version,
      arrangement_property_id: membership.arrangement_property_id ?? null },
    capabilities: [...capabilities],
    home_destination: homeDestination,
    context_epoch_hint: context.session_id,
  };
}
