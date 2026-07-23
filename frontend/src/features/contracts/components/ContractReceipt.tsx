import { Button } from '../../../components/ui/Button.tsx';
import { ContractAuditPanel } from './ContractAuditPanel.tsx';
import type { ContractReceipt as ContractReceiptData } from '../types.ts';

interface ContractReceiptProps {
  receipt: ContractReceiptData;
  userId: string;
  onClose: () => void;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function isSafeLink(value: string): boolean {
  if (value.startsWith('//')) return false;
  if (value.startsWith('/')) return true;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ContractReceipt({ receipt, userId, onClose }: ContractReceiptProps) {
  return (
    <div className="px-6 py-8 sm:px-8" aria-live="polite">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-500/15 text-2xl text-emerald-400">
          <svg
            className="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-slate-100">Contrato enviado</h3>
        <p className="mt-2 text-sm text-slate-400">
          La fila se agregó a Google Sheets y el recibo de auditoría está disponible.
        </p>
      </div>

      <dl className="mx-auto mt-7 max-w-xl divide-y divide-white/[0.07] border-y border-white/[0.07]">
        <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <dt className="text-xs font-medium text-slate-500">Submission ID</dt>
          <dd className="break-all font-mono text-sm text-slate-200">
            {receipt.submissionId}
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <dt className="text-xs font-medium text-slate-500">Fecha</dt>
          <dd className="text-sm text-slate-200">{formatTimestamp(receipt.timestamp)}</dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <dt className="text-xs font-medium text-slate-500">Rango agregado</dt>
          <dd className="break-all font-mono text-sm text-slate-200">
            {receipt.appendedRange}
          </dd>
        </div>
      </dl>

      <div className="mx-auto mt-6 flex max-w-xl flex-col gap-3 sm:flex-row sm:justify-center">
        {isSafeLink(receipt.sheetUrl) && (
          <a
            href={receipt.sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg border border-white/[0.11] bg-white/[0.08] px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.12]"
          >
            Abrir Google Sheet
          </a>
        )}
        {isSafeLink(receipt.auditUrl) && (
          <ContractAuditPanel auditUrl={receipt.auditUrl} userId={userId} />
        )}
      </div>

      <div className="mt-8 flex justify-center">
        <Button type="button" variant="primary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
