import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AlertInline } from '../components/ui/AlertInline';
import { useAuthentication } from '../app/contexts/AuthenticationContext';
import { loginAdmin, startGoogleLogin, type AdminAuthError } from '../features/contracts/services/adminAuthApi';
import {
  acceptInvitation,
  establishInvitationHandoff,
  registerInvitationAccount,
  resolveInvitation,
} from '../features/organizations/services/organizationApi';
import type { InvitationResolution } from '../features/organizations/types';

type PageState = 'resolving' | 'ready' | 'accepting' | 'accepted' | 'invalid' | 'unavailable';
type AuthMode = 'register' | 'login';

const roleLabel = { admin: 'administrador', member: 'miembro', viewer: 'lector' } as const;

export function InvitationAcceptPage() {
  const authentication = useAuthentication();
  const navigate = useNavigate();
  const token = useRef<string | null>(null);
  const initializationStarted = useRef(false);
  const [state, setState] = useState<PageState>('resolving');
  const [resolution, setResolution] = useState<InvitationResolution | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (initializationStarted.current) return;
    initializationStarted.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    token.current = fragment.get('invitation_token');
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    const prepare = token.current
      ? establishInvitationHandoff(token.current).then(() => { token.current = null; })
      : Promise.resolve();
    void prepare.then(() => resolveInvitation()).then((value) => {
      setResolution(value);
      setState('ready');
    }).catch(() => setState('invalid'));
  }, []);

  async function refreshAuthentication() {
    await authentication.refresh();
    window.dispatchEvent(new Event('form-site-auth-refresh'));
  }

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    setAuthError(null);
    if (authMode === 'register' && password !== passwordConfirmation) {
      setAuthError('Las contraseñas no coinciden.'); return;
    }
    setAuthPending(true);
    try {
      if (authMode === 'register') {
        await registerInvitationAccount({ display_name: name, password });
      } else {
        await loginAdmin({ email, password, rememberMe: true });
      }
      setPassword(''); setPasswordConfirmation('');
      await refreshAuthentication();
    } catch (caught) {
      const error = caught as AdminAuthError;
      setAuthError(authMode === 'register'
        ? 'No se pudo crear la cuenta. Si ya tenés una cuenta, iniciá sesión o usá Google.'
        : error.message || 'No se pudo iniciar sesión con esos datos.');
    } finally { setAuthPending(false); }
  }

  async function google() {
    setAuthError(null); setGooglePending(true);
    try { await startGoogleLogin('/invitations/accept'); }
    catch { setAuthError('No se pudo iniciar el acceso con Google.'); setGooglePending(false); }
  }

  async function accept() {
    setState('accepting');
    try {
      const result = await acceptInvitation();
      setState('accepted');
      await authentication.refresh();
      window.setTimeout(() => navigate(`/t/${result.organization_slug}`, { replace: true }), 0);
    } catch { setState('unavailable'); }
  }

  return (
    <main className="min-h-dvh bg-[var(--bg-base)] px-5 py-10 sm:grid sm:place-items-center">
      <section className="surface-elevated mx-auto w-full max-w-xl rounded-2xl p-6 shadow-2xl shadow-black/30 sm:p-8" aria-labelledby="invitation-title">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-400">Acceso por invitación</p>
        <h1 id="invitation-title" className="mt-3 text-2xl font-semibold">Unite a la organización</h1>

        <div aria-live="polite" className="mt-5 text-slate-300">
          {state === 'resolving' && <p>Validando invitación…</p>}
          {state === 'invalid' && <AlertInline variant="error" title="Invitación no disponible">La invitación no es válida o ya no está disponible.</AlertInline>}
          {state === 'unavailable' && <AlertInline variant="error" title="No se pudo aceptar">Verificá que hayas iniciado sesión con la dirección invitada e intentá nuevamente.</AlertInline>}
          {state === 'accepted' && <p>La invitación fue aceptada. Abriendo la organización…</p>}

          {resolution && state !== 'invalid' && state !== 'accepted' && (
            <>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p>Te invitaron a <strong>{resolution.organization_display_name}</strong>.</p>
                <dl className="mt-3 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                  <div><dt>Rol asignado</dt><dd className="font-medium text-slate-200">{roleLabel[resolution.intended_role]}</dd></div>
                  <div><dt>Cuenta invitada</dt><dd className="font-medium text-slate-200">{resolution.email_masked}</dd></div>
                </dl>
              </div>

              {authentication.status === 'authenticated' ? (
                <div className="mt-6">
                  <p className="text-sm text-slate-400">Sesión iniciada como <strong className="text-slate-200">{authentication.session?.user?.email ?? 'cuenta autenticada'}</strong>.</p>
                  <Button className="mt-4 w-full" aria-label="Aceptar invitación" loading={state === 'accepting'} onClick={() => void accept()}>
                    Aceptar invitación como {roleLabel[resolution.intended_role]}
                  </Button>
                  <button type="button" className="mt-3 w-full text-sm text-slate-400 hover:text-white"
                    onClick={() => void authentication.logout()}>Usar otra cuenta</button>
                </div>
              ) : (
                <div className="mt-6">
                  <div className="grid grid-cols-2 rounded-xl bg-white/[0.04] p-1" role="tablist" aria-label="Método de acceso">
                    <button type="button" role="tab" aria-selected={authMode === 'register'}
                      className={`rounded-lg px-3 py-2 text-sm ${authMode === 'register' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                      onClick={() => { setAuthMode('register'); setAuthError(null); }}>Crear cuenta</button>
                    <button type="button" role="tab" aria-selected={authMode === 'login'}
                      className={`rounded-lg px-3 py-2 text-sm ${authMode === 'login' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                      onClick={() => { setAuthMode('login'); setAuthError(null); }}>Iniciar sesión</button>
                  </div>

                  <form className="mt-5 grid gap-4" onSubmit={(event) => void authenticate(event)}>
                    {authMode === 'register' ? (
                      <>
                        <Input label="Nombre" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} autoComplete="name" />
                        <p className="text-xs text-slate-500">La cuenta quedará vinculada exclusivamente al correo de esta invitación.</p>
                      </>
                    ) : <Input label="Correo electrónico" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />}
                    <Input label="Contraseña" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={authMode === 'register' ? 12 : 8} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} />
                    {authMode === 'register' && <Input label="Confirmar contraseña" type="password" value={passwordConfirmation}
                      onChange={(event) => setPasswordConfirmation(event.target.value)} required minLength={12} autoComplete="new-password" />}
                    {authError && <AlertInline variant="error" title="No se pudo continuar">{authError}</AlertInline>}
                    <Button type="submit" loading={authPending}>{authMode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</Button>
                  </form>

                  <div className="my-5 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-white/10" />o<span className="h-px flex-1 bg-white/10" /></div>
                  <Button type="button" variant="secondary" className="w-full" loading={googlePending} onClick={() => void google()}>
                    Continuar con Google
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <Link to="/" className="mt-7 inline-block text-sm text-slate-500 hover:text-slate-300">Volver al inicio</Link>
      </section>
    </main>
  );
}
