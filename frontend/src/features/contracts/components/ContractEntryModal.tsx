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
  const creationRequestedRef = useRef(false);
  const navigate = useNavigate();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [direccion, setDireccion] = useState('');
  const creation = useMutation({
    mutationFn: (value?: string) => value ? createContractEntry(userId, value) : createContractEntry(userId),
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  const close = () => {
    if (creation.isPending) return;
    creationRequestedRef.current = false;
    setCopyState('idle');
    setDireccion('');
    creation.reset();
    onClose();
  };

  const createEntry = () => {
    if (creationRequestedRef.current) return;
    creationRequestedRef.current = true;
    creation.mutate(direccion.trim() || undefined);
  };

  const retry = () => {
    setCopyState('idle');
    creation.reset();
    creationRequestedRef.current = true;
    creation.mutate(direccion.trim() || undefined);
  };

  const openContractAdministration = () => {
    close();
    navigate('/contracts/admin');
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
      </header>

      <div className="px-6 py-7">
        {creation.isIdle && (
          <div className="space-y-6">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
              <h3 className="text-sm font-semibold text-slate-200">
                Generación de contratos
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Creá una entrada cuando estés listo para completar y compartir los formularios.
              </p>
            <label htmlFor="contract-direccion" className="block text-sm font-medium text-slate-300">
              Direccion del contrato
              <input
                id="contract-direccion"
                value={direccion}
                onChange={(event) => setDireccion(event.target.value)}
                placeholder="Ej.: Av. Colon 1234"
                maxLength={256}
                className="field-input mt-2 w-full"
              />
            </label>
            </div>
            <div className="flex flex-col items-center gap-4">
              <Button
                type="button"
                size="lg"
                onClick={createEntry}
                className="w-full max-w-md"
              >
                Generar nuevo contrato de alquiler
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={openContractAdministration}
                className="w-full max-w-sm"
              >
                Administrar contratos
              </Button>
            </div>
            <div className="flex justify-end border-t border-white/[0.07] pt-5">
              <Button type="button" variant="ghost" onClick={close}>Cerrar</Button>
            </div>
          </div>
        )}

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
            <div className="flex justify-center">
              <Button type="button" onClick={retry}>Reintentar</Button>
            </div>
            <div className="flex justify-end border-t border-white/[0.07] pt-5">
              <Button type="button" variant="ghost" onClick={close}>Cerrar</Button>
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

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <section className="rounded-xl border border-indigo-400/25 bg-indigo-500/[0.08] p-4" aria-labelledby="contract-user-link-title">
                  <h3 id="contract-user-link-title" className="text-sm font-semibold text-indigo-100">Formulario del usuario</h3>
                  <p className="mt-1 text-xs text-indigo-200/70">Completá la información del contrato.</p>
                  <a
                    href={creation.data.userUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex w-full items-center justify-center rounded-[10px] bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    Abrir info del contrato
                  </a>
                </section>
                <section className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.08] p-4" aria-labelledby="contract-client-link-title">
                  <h3 id="contract-client-link-title" className="text-sm font-semibold text-cyan-100">Formulario del cliente</h3>
                  <p className="mt-1 text-xs text-cyan-200/70">Compartí este acceso con el cliente.</p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void copyText(creation.data.clientUrl)
                        .then(() => setCopyState("copied"))
                        .catch(() => setCopyState("error"));
                    }}
                    className="mt-4 w-full py-3"
                  >
                    Formulario del cliente
                  </Button>
                </section>
              </div>
              {copyState === "copied" && (
                <p className="mt-3 text-xs text-emerald-400" role="status">
                  Enlace copiado
                </p>
              )}

              {copyState === "error" && (
                <div className="mt-4">
                  <AlertInline variant="error">No se pudo copiar el enlace del cliente.</AlertInline>
                </div>
              )}

              <div className="mt-7 flex flex-col items-center gap-4">
                <Button type="button" variant="secondary" onClick={openContractAdministration} className="w-full max-w-sm">
                  Administrar contratos
                </Button>
                <div className="flex w-full justify-end border-t border-white/[0.07] pt-5">
                  <Button type="button" variant="ghost" onClick={close}>Listo</Button>
                </div>
              </div>
          </div>
            </div>
        )}
      </div>
    </dialog>
  );
}
