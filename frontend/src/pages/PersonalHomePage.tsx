import { PersonalArrangements } from '../features/arrangements/components/PersonalArrangements';
import { useOrganization } from '../app/contexts/OrganizationContext';
import { ExclusiveHomeShell } from '../app/components/ExclusiveHomeShell';

export function PersonalHomePage() {
  const { capabilities } = useOrganization();
  return <ExclusiveHomeShell>{capabilities.includes('personal.arrangements.read') && <PersonalArrangements />}</ExclusiveHomeShell>;
}
