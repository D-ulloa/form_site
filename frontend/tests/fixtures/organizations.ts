import type { ConfirmedOrganizationContext } from '../../src/app/contexts/OrganizationContext.tsx';
import type { AdminSession } from '../../src/features/contracts/services/adminAuthApi.ts';

export const organizationSlugs = ['azar', 'solar'] as const;
export type OrganizationSlug = typeof organizationSlugs[number];

export function organizationContext(slug: OrganizationSlug): Omit<ConfirmedOrganizationContext, 'epoch'> {
  const suffix = slug === 'azar' ? '1' : '2';
  const organizationId = `20000000-0000-4000-8000-00000000000${suffix}`;
  return {
    organization: { id: organizationId, slug, display_name: slug === 'azar' ? 'Azar' : 'Solar', status: 'active' },
    membership: {
      id: `30000000-0000-4000-8000-00000000000${suffix}`, organization_id: organizationId,
      user_id: '10000000-0000-4000-8000-000000000001', role: 'owner', status: 'active', version: 1,
    },
    capabilities: ['contracts.manage', 'arrangements.read'],
  };
}

export const organizationSession: AdminSession = {
  authenticated: true,
  user: { id: '10000000-0000-4000-8000-000000000001', email: 'ana@example.test', name: 'Ana' },
  session: {
    id: '40000000-0000-4000-8000-000000000001', auth_method: 'password', assurance_level: 'aal1',
    created_at: '2026-09-10T00:00:00Z', absolute_expires_at: '2030-01-01T00:00:00Z',
    idle_expires_at: null, remembered: false,
  },
  memberships: organizationSlugs.map(slug => {
    const { organization, membership, capabilities } = organizationContext(slug);
    return {
      organization_id: organization.id, organization_slug: slug,
      organization_display_name: organization.display_name, organization_status: organization.status,
      membership_id: membership.id, membership_status: membership.status, role: membership.role, capabilities,
    };
  }),
};
