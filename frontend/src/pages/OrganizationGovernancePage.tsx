import { OrganizationGovernancePanel, type GovernanceSection } from '../features/organizations/components/OrganizationGovernancePanel';
import { useOrganization } from '../app/contexts/OrganizationContext';
import { createOrganizationInvitation } from '../features/organizations/services/organizationApi';
import type { OrganizationCapability } from '../features/organizations/types';

interface OrganizationGovernancePageProps { section: GovernanceSection }

export function OrganizationGovernancePage({ section }: OrganizationGovernancePageProps) {
  const context = useOrganization();
  const governanceCapabilities = context.capabilities.filter((capability): capability is OrganizationCapability =>
    capability.startsWith('organization.') || capability.startsWith('members.'));
  return <OrganizationGovernancePanel section={section} context={{
    organization_id: context.organization.id, organization_slug: context.organization.slug,
    display_name: context.organization.display_name, status: context.organization.status,
    plan_key: 'server_confirmed', role: context.membership.role, capabilities: governanceCapabilities,
  }} onInvite={async (input) => { await createOrganizationInvitation(context.organization.id, input); }} />;
}
