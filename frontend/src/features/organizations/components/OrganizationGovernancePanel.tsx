import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type {
  OrganizationContextSummary,
  OrganizationInvitationSummary,
  OrganizationMemberSummary,
  ManualInvitationReceipt,
} from '../types';

export type GovernanceSection = 'organization' | 'members' | 'invitations' | 'lifecycle';

interface OrganizationGovernancePanelProps {
  context: OrganizationContextSummary;
  section: GovernanceSection;
  members?: readonly OrganizationMemberSummary[];
  invitations?: readonly OrganizationInvitationSummary[];
  loadError?: string;
  onInvite?: (input: { email: string; intended_role: 'admin' | 'member' | 'viewer' }) => Promise<ManualInvitationReceipt>;
  onRotate?: (invitationId: string) => Promise<ManualInvitationReceipt>;
  onResend?: (invitationId: string) => Promise<void>;
  onRevoke?: (invitationId: string) => Promise<void>;
  onExport?: () => Promise<void>;
  onDeletionRequest?: () => Promise<void>;
}

export function OrganizationGovernancePanel({
  context,
  section,
  members = [],
  invitations = [],
  loadError = '',
  onInvite,
  onRotate,
  onResend,
  onRevoke,
  onExport,
  onDeletionRequest,
}: OrganizationGovernancePanelProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [status, setStatus] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const can = (capability: OrganizationContextSummary['capabilities'][number]) => context.capabilities.includes(capability);

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!onInvite) return;
    setStatus('Enviando invitación…');
    try {
      const result = await onInvite({ email, intended_role: role });
      setEmail('');
      setShareUrl(result.share_url);
      setStatus('Enlace creado. Copialo ahora: no se podrá consultar nuevamente.');
    } catch {
      setStatus('No se pudo crear la invitación.');
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareUrl(null);
      setStatus('Enlace copiado. Compartilo únicamente con la persona invitada.');
    } catch {
      setStatus('El navegador no permitió copiar el enlace. Generá uno nuevo o habilitá el portapapeles.');
    }
  }

  async function rotateLink(invitationId: string) {
    if (!onRotate) return;
    setStatus('Generando un enlace nuevo…');
    try {
      const result = await onRotate(invitationId);
      setShareUrl(result.share_url);
      setStatus('Enlace reemplazado. El anterior ya no es válido; copiá el nuevo ahora.');
    } catch {
      setStatus('No se pudo reemplazar el enlace.');
    }
  }

  return (
    <main className="w-full max-w-5xl mx-auto px-6 py-10" aria-labelledby="governance-title">
      <header className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-indigo-300">Organización</p>
          <Link className="text-sm text-slate-400 hover:text-white" to={`/t/${context.organization_slug}`}>Volver al inicio</Link>
        </div>
        <h1 id="governance-title" className="text-3xl font-semibold text-slate-100">{context.display_name}</h1>
        {context.status !== 'active' && (
          <p role="status" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
            Estado: {context.status}. Las operaciones normales están bloqueadas.
          </p>
        )}
      </header>

      {loadError && (
        <p role="alert" className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-200">
          {loadError}
        </p>
      )}

      {section === 'organization' && (
        <section className="surface rounded-xl p-6" aria-labelledby="settings-title">
          <h2 id="settings-title" className="text-xl font-medium">Configuración</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Identificador</dt><dd>{context.organization_slug}</dd></div>
            <div><dt className="text-xs text-slate-500">Plan</dt><dd>{context.plan_key}</dd></div>
            <div><dt className="text-xs text-slate-500">Rol actual</dt><dd>{context.role}</dd></div>
            <div><dt className="text-xs text-slate-500">Visibilidad</dt><dd>Organización completa</dd></div>
          </dl>
          <p className="mt-5 text-sm text-slate-400">La visibilidad «solo asignados» permanecerá deshabilitada hasta que contratos y propiedades la apliquen.</p>
        </section>
      )}

      {section === 'members' && (
        <section aria-labelledby="members-title" className="space-y-8">
          <div>
            <h2 id="members-title" className="text-xl font-medium">Miembros</h2>
            {members.length === 0 ? <p className="mt-4 text-slate-400">No hay miembros para mostrar.</p> : (
              <ul className="mt-4 space-y-3">
                {members.map((member) => (
                  <li key={member.user_id} className="surface rounded-xl p-4 flex justify-between gap-4">
                    <span><strong className="block">{member.display_name}</strong><span className="text-sm text-slate-400">{member.email_masked}</span></span>
                    <span className="text-right"><span className="block">{member.role}</span><span className="text-sm text-slate-400">{member.status}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {(section === 'members' || section === 'invitations') && (
        <section aria-labelledby="invitations-title">
          <h2 id="invitations-title" className="text-xl font-medium">Invitar a un miembro</h2>
          {can('members.invite') && (
            <form onSubmit={invite} className="surface mt-4 rounded-xl p-5 grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
              <Input label="Correo electrónico" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <label className="text-sm font-medium text-slate-300">Rol
                <select className="field-input mt-1.5" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
                  {context.role === 'owner' && <option value="admin">Administrador</option>}
                  <option value="member">Miembro</option><option value="viewer">Lector</option>
                </select>
              </label>
              <Button type="submit" disabled={!onInvite}>Crear enlace</Button>
            </form>
          )}
          <p aria-live="polite" className="mt-3 text-sm text-slate-300">{status}</p>
          {shareUrl && (
            <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4">
              <p className="text-sm text-cyan-100">El enlace se muestra una sola vez y vence con la invitación.</p>
              <Button className="mt-3" type="button" onClick={() => void copyLink()}>Copiar enlace</Button>
            </div>
          )}
          <ul className="mt-4 space-y-3">
            {invitations.map((invitation) => (
              <li key={invitation.invitation_id} className="surface rounded-xl p-4 flex flex-wrap justify-between gap-3">
                <span>{invitation.email_masked}<small className="block text-slate-400">{invitation.intended_role} · {invitation.status} · entrega: {invitation.delivery_state}</small></span>
                {invitation.next_action !== 'none' && <span className="flex gap-2">
                  {invitation.next_action === 'rotate_or_revoke'
                    ? <Button variant="secondary" disabled={!onRotate} onClick={() => void rotateLink(invitation.invitation_id)}>Generar enlace nuevo</Button>
                    : <Button variant="secondary" disabled={!onResend} onClick={() => void onResend?.(invitation.invitation_id)}>Reenviar</Button>}
                  <Button variant="danger" disabled={!onRevoke} onClick={() => void onRevoke?.(invitation.invitation_id)}>Revocar</Button>
                </span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {section === 'lifecycle' && (
        <section className="space-y-6" aria-labelledby="lifecycle-title">
          <h2 id="lifecycle-title" className="text-xl font-medium">Ciclo de vida</h2>
          <div className="surface rounded-xl p-5">
            <h3 className="font-medium">Exportación privada</h3>
            <p className="my-3 text-sm text-slate-400">Los archivos se generan de forma privada y expiran.</p>
            <Button variant="secondary" disabled={!can('organization.export') || !onExport} onClick={() => void onExport?.()}>Solicitar exportación</Button>
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
            <h3 className="font-medium text-red-300">Solicitar eliminación</h3>
            <p className="my-3 text-sm text-slate-400">La solicitud bloquea el trabajo normal y espera el período aprobado, retenciones y comprobantes de limpieza.</p>
            <Button variant="danger" disabled={!can('organization.request_deletion') || !onDeletionRequest} onClick={() => void onDeletionRequest?.()}>Solicitar eliminación</Button>
          </div>
        </section>
      )}
    </main>
  );
}
