import { OrganizationGovernancePanel, type GovernanceSection } from '../features/organizations/components/OrganizationGovernancePanel';
import { useOrganization } from '../app/contexts/OrganizationContext';
import { useEffect, useState } from 'react';
import { createOrganizationInvitation, listOrganizationInvitations, listOrganizationMembers,
  resendOrganizationInvitation, revokeOrganizationInvitation } from '../features/organizations/services/organizationApi';
import type { OrganizationCapability, OrganizationInvitationSummary, OrganizationMemberSummary } from '../features/organizations/types';

interface OrganizationGovernancePageProps { section: GovernanceSection }

export function OrganizationGovernancePage({ section }: OrganizationGovernancePageProps) {
  const context = useOrganization();
  const [members, setMembers] = useState<OrganizationMemberSummary[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitationSummary[]>([]);
  const reloadInvitations = async () => setInvitations((await listOrganizationInvitations(context.organization.id)).items);
  useEffect(() => {
    if (section === 'members') void listOrganizationMembers(context.organization.id).then((value) => setMembers(value.items));
    if (section === 'invitations') void listOrganizationInvitations(context.organization.id)
      .then((value) => setInvitations(value.items));
  }, [context.organization.id, section]);
  const governanceCapabilities = context.capabilities.filter((capability): capability is OrganizationCapability =>
    capability.startsWith('organization.') || capability.startsWith('members.'));
  return <OrganizationGovernancePanel section={section} context={{
    organization_id: context.organization.id, organization_slug: context.organization.slug,
    display_name: context.organization.display_name, status: context.organization.status,
    plan_key: 'server_confirmed', role: context.membership.role, capabilities: governanceCapabilities,
  }} members={members} invitations={invitations}
  onInvite={async (input) => { await createOrganizationInvitation(context.organization.id, input); await reloadInvitations(); }}
  onResend={async (id) => { await resendOrganizationInvitation(context.organization.id, id); await reloadInvitations(); }}
  onRevoke={async (id) => { await revokeOrganizationInvitation(context.organization.id, id); await reloadInvitations(); }} />;
}
