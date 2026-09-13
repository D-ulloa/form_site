import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { AlertInline } from '../../../components/ui/AlertInline';
import { ArrangementDialog } from './ArrangementDialog';
import { useArrangementOperation } from '../hooks/useArrangementProperties';
import { invitePersonal, rotatePersonalInvitation, revokePersonalInvitation, type PersonalInvitationReceipt } from '../services/arrangementPersonalApi';

const schema = z.object({ email: z.string().trim().max(320).pipe(z.email('Ingresá un correo válido.')) });
function PersonalInvitationDialog({ onClose }: { onClose: () => void }) {
  const { organization } = useOrganization();
  const operation = useArrangementOperation();
  const attempt = useRef<{ email: string; key: string } | null>(null);
  const [receipt, setReceipt] = useState<PersonalInvitationReceipt | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const acceptReceipt = (value: PersonalInvitationReceipt) => { setReceipt(value); setCopied(false); setCopyError(false); };
  return <ArrangementDialog title="Invitar personal" onClose={onClose}>
    {receipt ? <div className="grid gap-4">
      <p role="status">{receipt.status === 'revoked' ? 'Invitación revocada.' : receipt.status === 'pending' ? 'Invitación pendiente para Personal.' : 'La invitación ya no está pendiente.'}</p>
      {receipt.share_url ? <>
        <Input label="Enlace de invitación" readOnly value={receipt.share_url} />
        <Button type="button" onClick={() => {
          void navigator.clipboard.writeText(receipt.share_url!).then(() => setCopied(true)).catch(() => setCopyError(true));
        }}>{copied ? 'Enlace copiado' : 'Copiar enlace'}</Button>
        {copyError && <AlertInline>No se pudo copiar. Seleccioná el enlace y copialo manualmente.</AlertInline>}
      </> : receipt.status === 'pending' ? <p className="text-sm text-slate-400">{receipt.delivery_method === 'email'
        ? 'La entrega usa el correo de la invitación.' : 'Generá un nuevo enlace para compartir esta invitación.'}</p> : null}
      {receipt.status === 'pending' ? <div className="flex flex-wrap gap-3">
        <Button variant="secondary" loading={operation.pending} onClick={() => { void operation.run(
          signal => rotatePersonalInvitation(organization.id, receipt.invitation_id, signal), acceptReceipt); }}>
          {receipt.delivery_method === 'email' ? 'Reenviar invitación' : 'Generar nuevo enlace'}</Button>
        <Button variant="ghost" disabled={operation.pending} onClick={() => { void operation.run(
          signal => revokePersonalInvitation(organization.id, receipt.invitation_id, signal),
          () => setReceipt({ ...receipt, status: 'revoked', share_url: undefined, next_action: 'none' })); }}>Revocar invitación</Button>
      </div> : null}
    </div> : <form className="grid gap-5" noValidate onSubmit={event => { void handleSubmit(({ email }) => {
      const normalized = email.trim().toLowerCase();
      if (!attempt.current || attempt.current.email !== normalized) attempt.current = { email: normalized, key: crypto.randomUUID() };
      const key = attempt.current.key;
      void operation.run(signal => invitePersonal(organization.id, normalized, key, signal), acceptReceipt);
    })(event); }}>
      <Input label="Correo electrónico" type="email" autoFocus required autoComplete="email" disabled={operation.pending}
        {...register('email')} error={errors.email?.message} />
      <p className="text-sm text-slate-400">La persona invitada completará sus datos al aceptar.</p>
      <Button type="submit" loading={operation.pending}>Generar invitación</Button>
    </form>}
    {operation.error ? <AlertInline variant="error">{operation.error}</AlertInline> : null}
    <Button type="button" variant="ghost" className="mt-4" onClick={onClose}>Cerrar</Button>
  </ArrangementDialog>;
}

export function PersonalInvitationSection() {
  const { capabilities } = useOrganization();
  const [open, setOpen] = useState(false);
  if (!capabilities.includes('arrangements.personal.invite')) return null;
  return <div className="mb-6 flex justify-end">
    <Button variant="secondary" onClick={() => setOpen(true)}>Invitar personal</Button>
    {open ? <PersonalInvitationDialog onClose={() => setOpen(false)} /> : null}
  </div>;
}
