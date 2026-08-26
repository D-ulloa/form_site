import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { acceptInvitation, establishInvitationHandoff, resolveInvitation } from '../features/organizations/services/organizationApi';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthentication } from '../app/contexts/AuthenticationContext';
import type { InvitationResolution } from '../features/organizations/types';

type PageState = 'resolving' | 'ready' | 'accepting' | 'accepted' | 'invalid' | 'unavailable';

export function InvitationAcceptPage() {
  const authentication = useAuthentication(); const navigate = useNavigate();
  const token = useRef<string | null>(null);
  const [state, setState] = useState<PageState>('resolving');
  const [resolution, setResolution] = useState<InvitationResolution | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    token.current = fragment.get('invitation_token');
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    const prepare = token.current ? establishInvitationHandoff(token.current).then(() => { token.current = null; }) : Promise.resolve();
    void prepare.then(() => resolveInvitation()).then((value) => {
      setResolution(value);
      setState('ready');
    }).catch(() => setState('invalid'));
  }, []);

  async function accept() {
    setState('accepting');
    try {
      const result = await acceptInvitation();
      setState('accepted');
      await authentication.refresh();
      window.setTimeout(() => navigate(`/t/${result.organization_slug}`, { replace: true }), 0);
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
              {authentication.status === 'authenticated'
                ? <Button loading={state === 'accepting'} onClick={() => void accept()}>Aceptar invitación</Button>
                : <Link className="inline-flex rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white" to="/login?return_to=/invitations/accept">Iniciar sesión para aceptar</Link>}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
