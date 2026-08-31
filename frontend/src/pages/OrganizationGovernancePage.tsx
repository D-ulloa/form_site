import { OrganizationGovernancePanel, type GovernanceSection } from '../features/organizations/components/OrganizationGovernancePanel';
import { useOrganization } from '../app/contexts/OrganizationContext';
import { useEffect, useState } from 'react';
import { createOrganizationInvitation, listOrganizationInvitations, listOrganizationMembers,
  resendOrganizationInvitation, revokeOrganizationInvitation,
  rotateOrganizationInvitationLink } from '../features/organizations/services/organizationApi';
import type { OrganizationCapability, OrganizationInvitationSummary, OrganizationMemberSummary } from '../features/organizations/types';

interface OrganizationGovernancePageProps { section: GovernanceSection }

export function OrganizationGovernancePage({ section }: OrganizationGovernancePageProps) {
  const context = useOrganization();
  const [members, setMembers] = useState<OrganizationMemberSummary[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitationSummary[]>([]);
  const [loadError, setLoadError] = useState('');
  const canInviteMembers = context.capabilities.includes('members.invite');
  const reloadInvitations = async () => setInvitations((await listOrganizationInvitations(context.organization.id)).items);
  const refreshInvitations = () => {
    void reloadInvitations().then(() => setLoadError('')).catch(() => {
      setLoadError('No se pudo actualizar la lista de invitaciones.');
    });
  };
  useEffect(() => {
    let active = true;
    if (section === 'members') {
      void listOrganizationMembers(context.organization.id).then((value) => {
        if (active) setMembers(value.items);
      }).catch(() => {
        if (active) setLoadError('No se pudo cargar la lista de miembros.');
      });
      if (canInviteMembers) {
        void listOrganizationInvitations(context.organization.id).then((value) => {
          if (active) setInvitations(value.items);
        }).catch(() => {
          if (active) setLoadError('No se pudo cargar la lista de invitaciones.');
        });
      }
    }
    if (section === 'invitations') void listOrganizationInvitations(context.organization.id)
      .then((value) => { if (active) setInvitations(value.items); })
      .catch(() => { if (active) setLoadError('No se pudo cargar la lista de invitaciones.'); });
    return () => { active = false; };
  }, [canInviteMembers, context.organization.id, section]);
  const governanceCapabilities = context.capabilities.filter((capability): capability is OrganizationCapability =>
    capability.startsWith('organization.') || capability.startsWith('members.'));
  return <OrganizationGovernancePanel section={section} context={{
    organization_id: context.organization.id, organization_slug: context.organization.slug,
    display_name: context.organization.display_name, status: context.organization.status,
    plan_key: 'server_confirmed', role: context.membership.role, capabilities: governanceCapabilities,
  }} members={members} invitations={invitations} loadError={loadError}
  onInvite={async (input) => { const result = await createOrganizationInvitation(context.organization.id, input);
    refreshInvitations(); return result; }}
  onRotate={async (id) => { const result = await rotateOrganizationInvitationLink(context.organization.id, id);
    refreshInvitations(); return result; }}
  onResend={async (id) => { await resendOrganizationInvitation(context.organization.id, id); await reloadInvitations(); }}
  onRevoke={async (id) => { await revokeOrganizationInvitation(context.organization.id, id); await reloadInvitations(); }} />;
}
