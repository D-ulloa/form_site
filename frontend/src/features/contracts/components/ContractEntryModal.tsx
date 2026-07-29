import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertInline } from '../../../components/ui/AlertInline.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { createContractEntry } from '../services/contractApi.ts';

interface ContractEntryModalProps {
  open: boolean;
  userId: string;
  onClose: () => void;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard copy failed');
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function ContractEntryModal({ open, userId, onClose }: ContractEntryModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const startedRef = useRef(false);
  const navigate = useNavigate();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const creation = useMutation({ mutationFn: () => createContractEntry(userId) });
  const startCreation = creation.mutate;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    if (!startedRef.current) {
      startedRef.current = true;
      startCreation();
    }
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open, startCreation]);

  const close = () => {
    if (creation.isPending) return;
    startedRef.current = false;
    setCopyState('idle');
    creation.reset();
    onClose();
  };

  const retry = () => {
    setCopyState('idle');
    creation.reset();
    creation.mutate();
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="contract-entry-title"
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-white/[0.11] bg-[var(--bg-surface)] p-0 text-[var(--text-primary)] shadow-2xl shadow-black/50 backdrop:bg-black/70"
      onCancel={(event) => { event.preventDefault(); close(); }}
    >
      <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-5">
        <div>
          <h2 id="contract-entry-title" className="text-lg font-semibold text-slate-100">
            Nuevo contrato
          </h2>
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={close}
          disabled={creation.isPending}
          className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      <div className="px-6 py-7">
        {creation.isPending && (
          <div className="flex min-h-48 items-center justify-center" role="status">
            <span className="text-sm text-slate-400">Creando contrato…</span>
          </div>
        )}

        {creation.isError && (
          <div className="space-y-5">
            <AlertInline variant="error" title="No se pudo crear el contrato">
              Intentá nuevamente en unos instantes.
            </AlertInline>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={close}>Cerrar</Button>
              <Button type="button" onClick={retry}>Reintentar</Button>
            </div>
          </div>
        )}

        {creation.data && (
          <div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">
                    Esperando ambos formularios
                  </p>
                  <p className="mt-2 font-mono text-base text-slate-100">
                    {creation.data.entryId.slice(0, 8)}
                  </p>
                </div>
                <time className="text-xs text-slate-500" dateTime={creation.data.createdAt}>
                  {formatCreatedAt(creation.data.createdAt)}
                </time>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <a
                  href={creation.data.userUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-[10px] bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  Abrir info del contrato
                </a>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void copyText(creation.data.clientUrl)
                      .then(() => setCopyState('copied'))
                      .catch(() => setCopyState('error'));
                  }}
                >
                  Formulario del cliente
                </Button>
              </div>
              {copyState === 'copied' && (
                <p className="mt-3 text-xs text-emerald-400" role="status">
                  Enlace copiado
                </p>
              )}
            </div>

            {copyState === 'error' && (
              <div className="mt-4">
                <AlertInline variant="error">No se pudo copiar el enlace del cliente.</AlertInline>
              </div>
            )}

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => { close(); navigate('/contracts/admin'); }}>
                Administrar contratos
              </Button>
              <Button type="button" onClick={close}>Listo</Button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
