import { InquilinoArrangements } from '../features/arrangements/components/InquilinoArrangements';
import { useOrganization } from '../app/contexts/OrganizationContext';
import { ExclusiveHomeShell } from '../app/components/ExclusiveHomeShell';

export function InquilinoHomePage() {
  const { organization, membership, epoch } = useOrganization();
  return <ExclusiveHomeShell>
    <InquilinoArrangements key={`${organization.id}:${membership.id}:${membership.arrangement_property_id ?? 'none'}:${epoch}`} />
  </ExclusiveHomeShell>;
}
