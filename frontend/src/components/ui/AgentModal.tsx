import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAgent, type AgentData } from '../../app/contexts/AgentContext.tsx';
import { Button } from './Button.tsx';
import { Input } from './Input.tsx';

interface AgentModalProps {
  open: boolean;
  onClose: () => void;
}

export function AgentModal({ open, onClose }: AgentModalProps) {
  const { agent, setAgent } = useAgent();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [form, setForm] = useState<AgentData>({
    agent_user_id: agent?.agent_user_id ?? '',
    agent_name: agent?.agent_name ?? '',
    agent_email: agent?.agent_email ?? '',
  });
  const [errors, setErrors] = useState<Partial<AgentData>>({});

  useEffect(() => {
    if (open) {
      setForm({
        agent_user_id: agent?.agent_user_id ?? '',
        agent_name: agent?.agent_name ?? '',
        agent_email: agent?.agent_email ?? '',
      });
      setErrors({});
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open, agent]);

  const validate = (): boolean => {
    const e: Partial<AgentData> = {};
    if (!form.agent_user_id.trim()) e.agent_user_id = 'Requerido';
    if (!form.agent_name.trim()) e.agent_name = 'Requerido';
    if (!form.agent_email.trim()) e.agent_email = 'Requerido';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.agent_email))
      e.agent_email = 'Email inválido';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setAgent(form);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative w-full max-w-md surface-elevated rounded-2xl p-8 shadow-2xl shadow-black/40 animate-fade-in-up">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-slate-100">Configurar agente</h2>
          <p className="text-sm text-slate-400 mt-1">
            Estos datos se guardan localmente y se envían con cada propiedad.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Input
            label="ID de agente"
            id="agent-user-id"
            required
            placeholder="Ej: agent-001"
            value={form.agent_user_id}
            onChange={(e) => setForm((f) => ({ ...f, agent_user_id: e.target.value }))}
            error={errors.agent_user_id}
          />
          <Input
            label="Nombre completo"
            id="agent-name"
            required
            placeholder="Ej: Lucía Martínez"
            value={form.agent_name}
            onChange={(e) => setForm((f) => ({ ...f, agent_name: e.target.value }))}
            error={errors.agent_name}
          />
          <Input
            label="Email"
            id="agent-email"
            type="email"
            required
            placeholder="Ej: lucia@agencia.com"
            value={form.agent_email}
            onChange={(e) => setForm((f) => ({ ...f, agent_email: e.target.value }))}
            error={errors.agent_email}
          />

          <div className="flex gap-3 justify-end mt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Guardar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
