import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { acceptInvitation, resolveInvitation } from '../features/organizations/services/organizationApi';
import type { InvitationResolution } from '../features/organizations/types';

type PageState = 'resolving' | 'ready' | 'accepting' | 'accepted' | 'invalid' | 'unavailable';

export function InvitationAcceptPage() {
  const token = useRef<string | null>(null);
  const [state, setState] = useState<PageState>('resolving');
  const [resolution, setResolution] = useState<InvitationResolution | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    token.current = fragment.get('invitation_token');
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (!token.current) {
      setState('invalid');
      return;
    }
    void resolveInvitation(token.current).then((value) => {
      setResolution(value);
      setState('ready');
    }).catch(() => setState('invalid'));
  }, []);

  async function accept() {
    if (!token.current) return;
    setState('accepting');
    try {
      await acceptInvitation(token.current);
      token.current = null;
      setState('accepted');
    } catch {
      setState('unavailable');
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <section className="surface w-full max-w-lg rounded-2xl p-7" aria-labelledby="invitation-title">
        <h1 id="invitation-title" className="text-2xl font-semibold">Invitación a una organización</h1>
        <div aria-live="polite" className="mt-5 text-slate-300">
          {state === 'resolving' && <p>Validando invitación…</p>}
          {state === 'invalid' && <p>La invitación no es válida o ya no está disponible.</p>}
          {state === 'unavailable' && <p>No se pudo aceptar la invitación. Verificá tu cuenta e intentá nuevamente.</p>}
          {state === 'accepted' && <p>La invitación fue aceptada. Actualizá tu contexto para continuar.</p>}
          {resolution && (state === 'ready' || state === 'accepting') && (
            <div className="space-y-3">
              <p>Te invitaron a <strong>{resolution.organization_display_name}</strong> como <strong>{resolution.intended_role}</strong>.</p>
              <p className="text-sm text-slate-400">Cuenta invitada: {resolution.email_masked}</p>
              <Button loading={state === 'accepting'} onClick={() => void accept()}>Aceptar invitación</Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

