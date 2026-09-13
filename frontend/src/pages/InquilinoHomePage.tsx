import { InquilinoArrangements } from '../features/arrangements/components/InquilinoArrangements';
import { useOrganization } from '../app/contexts/OrganizationContext';
import { useAuthentication } from '../app/contexts/AuthenticationContext';

export function InquilinoHomePage() {
  const authentication = useAuthentication();
  const { organization, membership, epoch } = useOrganization();
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-[var(--bg-base)]">
      <header className="glass sticky top-0 z-10 border-b border-white/[0.07]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="accent-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
              <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-200">Gestión de Propiedades</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-400">
            <span className="min-w-0 [overflow-wrap:anywhere]">{authentication.session?.user.email}</span>
            <button type="button" onClick={() => { void authentication.logout(); }}
              className="shrink-0 rounded-lg py-2 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-400">
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Inicio</h1>
        <InquilinoArrangements key={`${organization.id}:${membership.id}:${membership.arrangement_property_id ?? "none"}:${epoch}`} />
      </main>
    </div>
  );
}
