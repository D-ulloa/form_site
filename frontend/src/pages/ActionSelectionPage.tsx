import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button.tsx';
import { AgentModal } from '../components/ui/AgentModal.tsx';
import { useAgent, type AgentData } from '../app/contexts/AgentContext.tsx';
import { ContractEntryModal } from '../features/contracts/components/ContractEntryModal.tsx';

type PendingAction = 'property' | 'contract' | null;

export function ActionSelectionPage() {
  const navigate = useNavigate();
  const { agent, isConfigured } = useAgent();
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractUserId, setContractUserId] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const runAction = (action: Exclude<PendingAction, null>, userId: string) => {
    if (action === 'property') {
      navigate('/properties/new');
      return;
    }

    setContractUserId(userId);
    setShowContractModal(true);
  };

  const handleAction = (action: Exclude<PendingAction, null>) => {
    if (!isConfigured || !agent) {
      setPendingAction(action);
      setShowAgentModal(true);
      return;
    }

    runAction(action, agent.agent_user_id);
  };

  const handleAgentSaved = (savedAgent: AgentData) => {
    if (pendingAction) runAction(pendingAction, savedAgent.agent_user_id);
  };

  const handleAgentModalClose = () => {
    setShowAgentModal(false);
    setPendingAction(null);
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAgentModal(true)}
            leftIcon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            }
          >
            {isConfigured ? agent!.agent_name : 'Configurar agente'}
          </Button>
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
                  Completá el formulario con los datos, subí las fotos y videos, y publicá
                  automáticamente en Drive, Sheets y Make.
                </p>
                <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Google Drive
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Google Sheets
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Make
                  </span>
                </div>
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
                <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    Dos formularios
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Datos protegidos
                  </span>
                </div>
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

          {/* More actions — coming soon */}
          <div className="mt-3 surface rounded-2xl p-6 opacity-40 cursor-not-allowed select-none">
            <div className="flex items-start gap-5">
              <div className="w-12 h-12 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-400">Editar propiedad</h2>
                <p className="text-sm text-slate-600 mt-0.5">Próximamente disponible en v2.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Agent status */}
        {!isConfigured && (
          <p className="mt-8 text-xs text-amber-500/80 animate-fade-in delay-200">
            Configurá tu perfil de agente antes de iniciar una operación.
          </p>
        )}
      </main>

      <AgentModal
        open={showAgentModal}
        onClose={handleAgentModalClose}
        onSaved={handleAgentSaved}
      />
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
