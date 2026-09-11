import { Link } from 'react-router-dom';
import { useOrganization } from '../app/contexts/OrganizationContext.tsx';
import { ArrangementOrdersDashboard } from '../features/arrangements/components/ArrangementOrdersDashboard.tsx';
import { AlertInline } from '../components/ui/AlertInline.tsx';

export function ArrangementsPage() {
  const { organization, epoch, capabilities } = useOrganization();

  return (
    <div className="flex flex-1 flex-col bg-[var(--bg-base)]">
      <header className="glass sticky top-0 z-10 border-b border-white/[0.07]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="accent-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
              <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-200">Gestión de Propiedades</span>
          </div>
          <Link
            to={`/t/${organization.slug}`}
            className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-400"
          >
            Inicio
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        {capabilities.includes('arrangements.read')
          ? <ArrangementOrdersDashboard key={`${organization.id}:${epoch}`} />
          : <AlertInline>No tenés acceso a las órdenes de esta organización.</AlertInline>}
      </main>
    </div>
  );
}
