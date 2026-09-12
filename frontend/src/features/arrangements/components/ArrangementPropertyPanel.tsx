import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { AlertInline } from '../../../components/ui/AlertInline';
import { useArrangementCollection, useArrangementOperation } from '../hooks/useArrangementProperties';
import { associateArrangementInquilino, inviteArrangementInquilino, rotateArrangementInvitation, revokeArrangementInvitation,
  type ArrangementProperty, type PropertyInvitationReceipt } from '../services/arrangementPropertiesApi';
import { ArrangementDialog } from './ArrangementDialog';

const schema = z.object({ email: z.string().trim().email('Ingresá un correo válido.').max(320) });
const statusLabel = { pending: 'Invitación pendiente', accepted: 'Invitación aceptada', expired: 'Invitación vencida',
  revoked: 'Invitación revocada', replaced: 'Invitación reemplazada' } as const;

function ExistingInquilinos({ property, onChanged }: { property: ArrangementProperty; onChanged: () => void }) {
  const { organization } = useOrganization();
  const query = useArrangementCollection('available');
  const operation = useArrangementOperation();
  const [status, setStatus] = useState('');
  const members = query.data?.pages.flatMap(page => page.items) ?? [];
  return <div className="grid gap-3">
    <p className="text-sm text-slate-400">Inquilinos activos pendientes de asociación.</p>
    {query.isPending && <p role="status">Cargando candidatos…</p>}
    {query.isError && <AlertInline>No se pudieron cargar los candidatos.</AlertInline>}
    <Button variant="ghost" size="sm" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>Actualizar candidatos</Button>
    {!query.isPending && !query.isError && members.length === 0 && <p>No hay inquilinos sin propiedad.</p>}
    <ul className="grid gap-2">{members.map(member => <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 p-3">
      <span className="min-w-0 [overflow-wrap:anywhere]">{member.display_name}</span>
      <Button size="sm" disabled={operation.pending} onClick={() => { void operation.run(
        signal => associateArrangementInquilino(organization.id, property.id, member, signal),
        () => { setStatus('Inquilino asociado.'); onChanged(); },
      ); }}>Asociar {member.display_name}</Button>
    </li>)}</ul>
    {query.hasNextPage && <Button variant="ghost" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>Cargar más candidatos</Button>}
    {operation.error && <AlertInline variant="error">{operation.error}</AlertInline>}
    <p role="status" className="text-sm text-slate-300">{status}</p>
  </div>;
}

export function ArrangementPropertyPanel({ property, onClose, onChanged }: {
  property: ArrangementProperty; onClose: () => void; onChanged: () => void;
}) {
  const { organization, capabilities } = useOrganization();
  const members = useArrangementCollection('inquilinos', property.id);
  const invitations = useArrangementCollection('invitations', property.id);
  const operation = useArrangementOperation();
  const [mode, setMode] = useState<'invite' | 'existing'>('invite');
  const [receipt, setReceipt] = useState<PropertyInvitationReceipt | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const attempt = useRef<{ email: string; key: string } | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '' } });
  const canInvite = capabilities.includes('members.invite');
  const canAssociate = capabilities.includes('members.manage_member');
  function received(result: PropertyInvitationReceipt) { setReceipt(result); setCopyStatus(''); reset(); attempt.current = null; onChanged(); }
  function rotate(id: string) {
    setReceipt(null); setCopyStatus('');
    void operation.run(signal => rotateArrangementInvitation(organization.id, property.id, id, signal), received);
  }
  return <ArrangementDialog title="Agregar inquilino" onClose={onClose}>
    <div className="mb-5 rounded-xl bg-white/5 p-4"><p className="font-medium [overflow-wrap:anywhere]">{property.name}</p>
      <p className="mt-1 font-mono text-xs text-slate-400 [overflow-wrap:anywhere]">{property.id}</p></div>
    <div className="mb-5 flex flex-wrap gap-2" aria-label="Forma de incorporación">
      {canInvite && <Button variant={mode === 'invite' ? 'primary' : 'ghost'} onClick={() => { setMode('invite'); setReceipt(null); }}>Invitar por correo</Button>}
      {canAssociate && <Button variant={mode === 'existing' ? 'primary' : 'ghost'} onClick={() => { setMode('existing'); setReceipt(null); }}>Asociar existente</Button>}
    </div>
    {mode === 'existing' && canAssociate ? <ExistingInquilinos property={property} onChanged={onChanged} /> : canInvite && <form noValidate className="grid gap-4" onSubmit={event => { void handleSubmit(({ email }) => {
      const normalized = email.normalize('NFKC').toLowerCase();
      if (!attempt.current || attempt.current.email !== normalized) attempt.current = { email: normalized, key: crypto.randomUUID() };
      const key = attempt.current.key;
      setReceipt(null);
      void operation.run(signal => inviteArrangementInquilino(organization.id, property.id, normalized, key, signal), received);
    })(event); }}>
      <Input label="Correo electrónico" type="email" required {...register('email')} error={errors.email?.message} disabled={operation.pending} />
      <Button type="submit" loading={operation.pending}>Generar invitación</Button>
    </form>}
    {operation.error && <AlertInline variant="error">{operation.error}</AlertInline>}
    {receipt && <div className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4">
      {receipt.share_url ? <><p className="text-sm">Invitación creada. Copiá el enlace para compartirlo.</p>
        <Button className="mt-3" onClick={() => { void navigator.clipboard.writeText(receipt.share_url!).then(() => {
          setCopyStatus('Enlace copiado.');
        }).catch(() => setCopyStatus('No se pudo copiar. Revisá el permiso del portapapeles e intentá de nuevo.')); }}>Copiar enlace</Button></>
        : <><p className="text-sm">Este intento ya fue procesado. El enlace anterior no se puede consultar.</p>
          {receipt.next_action === 'rotate_or_revoke' && <Button className="mt-3" disabled={operation.pending} onClick={() => rotate(receipt.invitation_id)}>Generar enlace nuevo</Button>}</>}
      <p role="status" className="mt-2 text-sm">{copyStatus}</p>
    </div>}
    <section className="mt-7 border-t border-white/10 pt-5" aria-labelledby="property-members-title"><h3 id="property-members-title" className="font-medium">Inquilinos asociados</h3>
      {members.isPending && <p role="status">Cargando inquilinos…</p>}
      {members.isError && <AlertInline>No se pudieron cargar los inquilinos.</AlertInline>}
      <Button variant="ghost" size="sm" disabled={members.isFetching} onClick={() => { void members.refetch(); }}>Actualizar inquilinos</Button>
      <ul className="mt-3 grid gap-2">{members.data?.pages.flatMap(page => page.items).map(member => <li key={member.id} className="text-sm [overflow-wrap:anywhere]">
        {member.display_name} · {member.role === 'inquilino' && member.status === 'active' ? 'Inquilino activo'
          : member.status === 'suspended' ? 'Suspendido' : member.status === 'removed' ? 'Removido' : `Rol actual: ${member.role}`}
      </li>)}</ul>
      {members.data?.pages.every(page => page.items.length === 0) && <p className="mt-2 text-sm text-slate-400">Todavía no hay inquilinos asociados.</p>}
      {members.hasNextPage && <Button variant="ghost" disabled={members.isFetching} onClick={() => { void members.fetchNextPage(); }}>Cargar más inquilinos</Button>}
    </section>
    <section className="mt-6 border-t border-white/10 pt-5" aria-labelledby="property-invitations-title"><h3 id="property-invitations-title" className="font-medium">Invitaciones</h3>
      {invitations.isPending && <p role="status">Cargando invitaciones…</p>}
      {invitations.isError && <AlertInline>No se pudieron cargar las invitaciones.</AlertInline>}
      <Button variant="ghost" size="sm" disabled={invitations.isFetching} onClick={() => { void invitations.refetch(); }}>Actualizar invitaciones</Button>
      <ul className="mt-3 grid gap-3">{invitations.data?.pages.flatMap(page => page.items).map(invitation => <li key={invitation.id} className="rounded-lg bg-white/5 p-3">
        <p className="text-sm [overflow-wrap:anywhere]">{invitation.email_masked}</p><p className="mt-1 text-xs text-slate-400">{statusLabel[invitation.status]}</p>
        <p className="mt-1 text-xs text-slate-400">Vence: {new Date(invitation.expires_at).toLocaleString('es')}</p>
        {canInvite && (invitation.status === 'pending' || invitation.status === 'expired') && <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={operation.pending} onClick={() => rotate(invitation.id)}>Generar enlace nuevo</Button>
          <Button size="sm" variant="danger" disabled={operation.pending} onClick={() => {
            setReceipt(null); void operation.run(signal => revokeArrangementInvitation(organization.id, invitation.id, signal), onChanged);
          }}>Revocar</Button>
        </div>}
      </li>)}</ul>
      {invitations.data?.pages.every(page => page.items.length === 0) && <p className="mt-2 text-sm text-slate-400">No hay invitaciones para esta propiedad.</p>}
      {invitations.hasNextPage && <Button variant="ghost" disabled={invitations.isFetching} onClick={() => { void invitations.fetchNextPage(); }}>Cargar más invitaciones</Button>}
    </section>
  </ArrangementDialog>;
}
