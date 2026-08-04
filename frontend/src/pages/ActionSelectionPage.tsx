import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AgentModal } from '../components/ui/AgentModal.tsx';
import { useAgent, type AgentData } from '../app/contexts/AgentContext.tsx';
import { ContractEntryModal } from '../features/contracts/components/ContractEntryModal.tsx';
import {
  fetchAdminSession,
  logoutAdmin,
  type AdminSession,
} from '../features/contracts/services/adminAuthApi.ts';

type PendingAction = 'property' | 'contract' | null;

function AuthEntry() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eef5fb] px-6 py-16 text-slate-900">
      <section className="w-full max-w-md rounded-2xl border border-[#d4e0ec] bg-white p-8 text-center shadow-[0_12px_28px_rgba(35,70,105,0.12)]">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#0754c7] text-white">
          <span className="text-lg font-bold">O</span>
        </div>
        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-[#37577b]">OPEV-H</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">Accedé a tu espacio de trabajo</h1>
        <p className="mt-2 text-sm leading-5 text-[#365579]">
          Registrate o iniciá sesión para crear y administrar contratos.
        </p>
        <div className="mt-7 grid gap-3">
          <Link to="/register" className="rounded-lg bg-[#0754c7] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0645a5]">
            Registrarse
          </Link>
          <Link to="/login" className="rounded-lg border border-[#b8cce2] px-4 py-3 text-sm font-semibold text-[#0754c7] transition-colors hover:bg-[#eef5fb]">
            Iniciar sesión
          </Link>
        </div>
      </section>
    </main>
  );
}

export function ActionSelectionPage() {
  const navigate = useNavigate();
  const { agent, isConfigured } = useAgent();
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractUserId, setContractUserId] = useState<string | undefined>();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    void fetchAdminSession()
      .then(setAdminSession)
      .catch(() => setAdminSession(null))
      .finally(() => setSessionChecked(true));
  }, []);

  if (!sessionChecked) {
    return <main className="flex min-h-dvh items-center justify-center bg-[#eef5fb] text-sm text-[#365579]">Cargando…</main>;
  }
  if (!adminSession) return <AuthEntry />;

  const runAction = (action: Exclude<PendingAction, null>, userId?: string) => {
    if (action === 'property') {
      navigate('/properties/new');
      return;
    }
    setContractUserId(userId);
    setShowContractModal(true);
  };

  const handleAction = (action: Exclude<PendingAction, null>) => {
    if (action === 'property' && (!isConfigured || !agent)) {
      setPendingAction(action);
      setShowAgentModal(true);
      return;
    }
    runAction(action, adminSession.user.id);
  };

  const handleAgentSaved = (savedAgent: AgentData) => {
    if (pendingAction) runAction(pendingAction, savedAgent.agent_user_id);
  };

  const handleAgentModalClose = () => {
    setShowAgentModal(false);
    setPendingAction(null);
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="glass sticky top-0 z-10 border-b border-white/[0.07]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="accent-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
              <span className="font-semibold text-white">O</span>
            </div>
            <span className="text-sm font-semibold text-slate-200">OPEV-H</span>
          </div>
          <button
            type="button"
            className="text-xs text-slate-400 hover:text-white"
            onClick={() => { void logoutAdmin().then(() => setAdminSession(null)); }}
          >
            {adminSession.user.email} · Cerrar sesión
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="mb-14 text-center animate-fade-in-up">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-600/15 px-3 py-1.5 text-xs font-medium text-indigo-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
            Sistema interno
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-100 sm:text-5xl">
            ¿Qué querés <span className="gradient-text">hacer hoy?</span>
          </h1>
          <p className="mx-auto max-w-md text-lg text-slate-400">Seleccioná una acción para comenzar a trabajar.</p>
        </div>

        <div className="w-full max-w-lg animate-fade-in-up delay-100">
          <button type="button" id="btn-add-property" onClick={() => handleAction('property')} className="group surface w-full cursor-pointer rounded-2xl p-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10">
            <div className="flex items-start gap-5">
              <div className="accent-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-lg shadow-indigo-700/30 transition-transform group-hover:scale-105">
                <span className="text-2xl text-white">+</span>
              </div>
              <div className="flex-1">
                <h2 className="mb-1 text-lg font-semibold text-slate-100 transition-colors group-hover:text-white">Agregar nueva propiedad</h2>
                <p className="text-sm leading-relaxed text-slate-500">Completá el formulario con los datos y subí las fotos y videos de la propiedad.</p>
              </div>
              <span className="text-xl text-slate-600 transition-all group-hover:translate-x-1 group-hover:text-indigo-400">›</span>
            </div>
          </button>

          <button type="button" id="btn-generate-contract" onClick={() => handleAction('contract')} className="group surface mt-3 w-full cursor-pointer rounded-2xl p-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10">
            <div className="flex items-start gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-2xl text-cyan-300 transition-transform group-hover:scale-105">▤</div>
              <div className="min-w-0 flex-1">
                <h2 className="mb-1 text-lg font-semibold text-slate-100 transition-colors group-hover:text-white">Generar contrato</h2>
                <p className="text-sm leading-relaxed text-slate-500">Creá y completá la información del contrato junto con el cliente.</p>
              </div>
              <span className="text-xl text-slate-600 transition-all group-hover:translate-x-1 group-hover:text-cyan-400">›</span>
            </div>
          </button>

          <div className="surface mt-3 cursor-not-allowed select-none rounded-2xl p-6 opacity-40">
            <div className="flex items-start gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-xl text-slate-500">✎</div>
              <div>
                <h2 className="text-base font-semibold text-slate-400">Editar propiedad</h2>
                <p className="mt-0.5 text-sm text-slate-600">Próximamente disponible en v2.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <AgentModal open={showAgentModal} onClose={handleAgentModalClose} onSaved={handleAgentSaved} />
      <ContractEntryModal
        open={showContractModal}
        userId={contractUserId}
        onClose={() => { setShowContractModal(false); setContractUserId(''); }}
      />
    </div>
  );
}
