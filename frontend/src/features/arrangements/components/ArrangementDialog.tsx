import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from '../../../components/ui/Button';

export function ArrangementDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus();
    return () => { dialog?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-5 text-slate-100 shadow-2xl backdrop:bg-black/70 sm:p-7">
    <div className="mb-5 flex items-center justify-between gap-3"><h2 id={titleId} className="text-xl font-semibold">{title}</h2>
      <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar diálogo">Cerrar</Button></div>
    {children}
  </dialog>;
}
