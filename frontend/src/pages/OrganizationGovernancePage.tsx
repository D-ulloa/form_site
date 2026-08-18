import { useParams } from 'react-router-dom';
import type { GovernanceSection } from '../features/organizations/components/OrganizationGovernancePanel';

interface OrganizationGovernancePageProps { section: GovernanceSection }

export function OrganizationGovernancePage({ section }: OrganizationGovernancePageProps) {
  const { organizationSlug } = useParams();
  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <section className="surface max-w-xl rounded-2xl p-7" aria-labelledby="staged-title">
        <p className="text-sm text-indigo-300">{organizationSlug} · {section}</p>
        <h1 id="staged-title" className="mt-2 text-2xl font-semibold">Contexto de organización requerido</h1>
        <p className="mt-4 text-slate-400">Esta pantalla está preparada, pero permanece cerrada hasta que la sesión revocable de SPEC-27 valide la organización y la membresía en el servidor.</p>
      </section>
    </main>
  );
}

