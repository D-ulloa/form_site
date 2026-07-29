import { useState, type MouseEvent } from 'react';
import { AlertInline } from '../../../components/ui/AlertInline.tsx';
import { fetchContractAudit } from '../services/contractApi.ts';

interface ContractAuditPanelProps {
  auditUrl: string;
  userId: string;
}

export function ContractAuditPanel({ auditUrl, userId }: ContractAuditPanelProps) {
  const [auditData, setAuditData] = useState<unknown>();
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [auditPending, setAuditPending] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const handleAuditClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (auditPending) return;

    setAuditPending(true);
    setAuditError(null);
    try {
      setAuditData(await fetchContractAudit(auditUrl, userId));
      setAuditLoaded(true);
    } catch (error) {
      setAuditError(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar el recibo de auditoría.',
      );
    } finally {
      setAuditPending(false);
    }
  };

  return (
    <div className="contents" aria-live="polite">
      <a
        href={auditUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleAuditClick}
        aria-busy={auditPending}
        className="inline-flex items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-sm font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20"
      >
        {auditPending ? 'Cargando auditoría...' : 'Ver recibo de auditoría'}
      </a>

      {auditError && (
        <div className="basis-full pt-2">
          <AlertInline variant="error" title="No se pudo abrir la auditoría">
            {auditError}
          </AlertInline>
        </div>
      )}

      {auditLoaded && (
        <section className="basis-full pt-3 text-left" aria-labelledby="contract-audit-title">
          <h4 id="contract-audit-title" className="text-sm font-semibold text-slate-200">
            Recibo de auditoría
          </h4>
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-white/[0.08] bg-black/20 p-4 text-xs leading-5 text-slate-300">
            {JSON.stringify(auditData, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
