import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ContractEntryModal } from '../features/contracts/components/ContractEntryModal.tsx';
import { useAuthentication } from '../app/contexts/AuthenticationContext.tsx';
import { useOptionalOrganization } from '../app/contexts/OrganizationContext.tsx';
import { clearContractAdminQueryCache } from '../features/contracts/services/contractAdminQueryCache.ts';

type Action = 'property' | 'contract';

function AuthEntry() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--bg-base)] px-6 py-16">
      <div className="pointer-events-none absolute left-1/2 top-[-14rem] h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-3xl" />
      <section className="surface-elevated relative w-full max-w-md rounded-2xl p-8 text-center shadow-2xl shadow-black/30">
        <div className="accent-gradient mx-auto flex h-11 w-11 items-center justify-center rounded-xl shadow-lg shadow-indigo-700/25">
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="1.5" />
            <path strokeLinecap="round" d="M9 3.5v3M15 3.5v3M9 17.5v3M15 17.5v3M3.5 9h3M17.5 9h3M3.5 15h3M17.5 15h3" />
          </svg>
        </div>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-400">
          Acceso al sistema
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-100">
          Gestioná propiedades y contratos
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">
          Iniciá sesión con una cuenta autorizada para acceder a las herramientas de gestión.
        </p>
        <div className="mt-7 grid gap-3">
          <Link
            to="/login"
            className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-700/25 transition-colors hover:bg-indigo-500"
          >
            Iniciar sesión
          </Link>
        </div>
      </section>
    </main>
  );
}

export function ActionSelectionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authentication = useAuthentication();
  const organizationContext = useOptionalOrganization();
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractUserId, setContractUserId] = useState<string | undefined>();

  if (authentication.status === 'loading' || authentication.status === 'unavailable') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--bg-base)] text-sm text-slate-400" role="status">
        Comprobando sesión…
      </main>
    );
  }

  if (!authentication.session) return <AuthEntry />;
  const authenticatedSession = authentication.session;

  if (!organizationContext) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--bg-base)] px-6 py-16">
        <section className="surface-elevated w-full max-w-lg rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-slate-100">Elegí una organización</h1>
          <p className="mt-2 text-sm text-slate-400">La selección se valida nuevamente en el servidor.</p>
          <div className="mt-6 grid gap-3">
            {(authenticatedSession.memberships ?? []).length === 0 ? (
              <p className="rounded-xl border border-white/10 p-4 text-sm text-slate-400">No tenés membresías activas. Aceptá una invitación para continuar.</p>
            ) : (authenticatedSession.memberships ?? []).map((membership) => (
              <Link key={membership.membership_id} to={`/t/${membership.organization_slug}`}
                className="rounded-xl border border-white/10 p-4 text-sm text-slate-200 hover:border-indigo-400/50">
                {membership.organization_display_name} · {membership.role}
              </Link>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const runAction = (action: Action, userId?: string) => {
    if (action === 'property') {
      navigate(`/t/${organizationContext.organization.slug}/properties/new`);
      return;
    }

    setContractUserId(userId);
    setShowContractModal(true);
  };

  const handleAction = (action: Action) => {
    runAction(action, authenticatedSession.user.id);
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Top bar */}
      <header className="glass border-b border-white/[0.07] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg accent-gradient flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-200">Gestión de Propiedades</span>
          </div>
          <button
            type="button"
            className="text-xs text-slate-400 transition-colors hover:text-white"
            onClick={() => {
              void authentication.logout().then(() => {
                clearContractAdminQueryCache(queryClient);
              });
            }}
          >
            {authenticatedSession.user.email} · Cerrar sesión
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-14 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 bg-indigo-600/15 border border-indigo-500/25 text-indigo-400 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Sistema interno
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-100 mb-4">
            ¿Qué querés{' '}
            <span className="gradient-text">hacer hoy?</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-md mx-auto">
            Seleccioná una acción para comenzar a trabajar.
          </p>
        </div>

        {/* Action cards */}
        <div className="w-full max-w-lg animate-fade-in-up delay-100">
          <button
            type="button"
            id="btn-add-property"
            onClick={() => handleAction('property')}
            className="group w-full surface rounded-2xl p-6 text-left transition-all duration-200 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="flex items-start gap-5">
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl accent-gradient flex items-center justify-center shrink-0 shadow-lg shadow-indigo-700/30 group-hover:scale-105 transition-transform">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>

              <div className="flex-1">
                <h2 className="text-lg font-semibold text-slate-100 mb-1 group-hover:text-white transition-colors">
                  Agregar nueva propiedad
                </h2>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Completá el formulario con los datos y subí las fotos y videos de la propiedad.
                </p>
              </div>

              <svg
                className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all shrink-0 mt-0.5"
                fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>

          <button
            type="button"
            id="btn-generate-contract"
            onClick={() => handleAction('contract')}
            className="group mt-3 w-full surface rounded-2xl p-6 text-left transition-all duration-200 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="flex items-start gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300 transition-transform group-hover:scale-105">
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h8l4 4v14H7z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 3v5h4M10 13h6M10 17h6" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="mb-1 text-lg font-semibold text-slate-100 transition-colors group-hover:text-white">
                  Generar contrato
                </h2>
                <p className="text-sm leading-relaxed text-slate-500">
                  Creá y completá la información del contrato junto con el cliente.
                </p>
              </div>

              <svg
                className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 transition-all group-hover:translate-x-1 group-hover:text-cyan-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>

          <button
            type="button"
            id="btn-admin-contracts"
            aria-label="Administrar contratos"
            onClick={() => navigate(`/t/${organizationContext.organization.slug}/contracts/admin`)}
            className="group mt-3 w-full surface rounded-2xl p-6 text-left transition-all duration-200 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="flex items-start gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 transition-transform group-hover:scale-105">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7.5h15M6.75 4.5h10.5A2.25 2.25 0 0119.5 6.75v10.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 17.25V6.75A2.25 2.25 0 016.75 4.5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 11.25h2.25m-2.25 3h4.5m2.25-3h1.5m-1.5 3h1.5" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="mb-1 text-lg font-semibold text-slate-100 transition-colors group-hover:text-white">
                  Administrar contratos
                </h2>
                <p className="text-sm leading-relaxed text-slate-500">
                  Consultá y gestioná los contratos existentes.
                </p>
              </div>
              <svg
                className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 transition-all group-hover:translate-x-1 group-hover:text-emerald-400"
                fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>
        </div>

      </main>

      <ContractEntryModal
        open={showContractModal}
        userId={contractUserId}
        onClose={() => {
          setShowContractModal(false);
          setContractUserId('');
        }}
      />
    </div>
  );
}
