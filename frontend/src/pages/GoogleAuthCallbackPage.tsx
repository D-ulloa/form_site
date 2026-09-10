import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertInline } from '../components/ui/AlertInline.tsx';
import { Button } from '../components/ui/Button.tsx';
import {
  completeGoogleLogin,
  GoogleAuthError,
  retryGoogleHandoff,
  startGoogleLogin,
  SELF_SERVICE_OPERATION_STORAGE_KEY,
  type AdminSession,
  type SelfServiceSession,
} from '../features/contracts/services/adminAuthApi.ts';
import { clearContractAdminQueryCache } from '../features/contracts/services/contractAdminQueryCache.ts';
import { useAuthentication } from '../app/contexts/AuthenticationContext.tsx';

export function GoogleAuthCallbackPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refresh } = useAuthentication();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('return_to') === '/invitations/accept' ? '/invitations/accept' : '/';
  const operationId = searchParams.get('self_service_operation');
  const [error, setError] = useState<{ message: string; handoff: boolean } | null>(null);
  const [retrying, setRetrying] = useState(false);

  const showError = useCallback((caughtError: unknown) => {
    setError({
      message: caughtError instanceof Error ? caughtError.message : 'No se pudo completar el acceso con Google.',
      handoff: caughtError instanceof GoogleAuthError && caughtError.stage === 'handoff',
    });
  }, []);

  const enterApplication = useCallback(async (session: AdminSession | SelfServiceSession, isActive: () => boolean = () => true) => {
    clearContractAdminQueryCache(queryClient);
    await refresh();
    if (!isActive()) return;
    window.dispatchEvent(new Event('form-site-auth-refresh'));
    const destination = 'onboarding' in session
      ? `/t/${encodeURIComponent(session.onboarding.organization_slug)}` : returnTo;
    if ('onboarding' in session) {
      try { sessionStorage.removeItem(SELF_SERVICE_OPERATION_STORAGE_KEY); } catch { /* Session is already established. */ }
    }
    navigate(destination, { replace: true });
  }, [navigate, queryClient, refresh, returnTo]);

  useEffect(() => {
    let active = true;
    void completeGoogleLogin()
      .then(async (session) => {
        if (active) await enterApplication(session, () => active);
      })
      .catch((caughtError) => {
        if (active) showError(caughtError);
      });
    return () => { active = false; };
  }, [enterApplication, showError]);

  async function retry(restart: boolean) {
    setRetrying(true);
    try {
      if (restart) await startGoogleLogin(returnTo, operationId ?? undefined);
      else await enterApplication(await retryGoogleHandoff());
    } catch (caughtError) {
      showError(caughtError);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--bg-base)] px-6 py-16">
      <section className="surface-elevated w-full max-w-md rounded-2xl p-8 text-center shadow-2xl shadow-black/30">
        {error ? (
          <>
            <AlertInline variant="error" title={error.handoff ? 'No se pudo completar el acceso' : 'No se pudo iniciar sesión'}>
              {error.message}
            </AlertInline>
            <Button className="mt-6 w-full" loading={retrying} onClick={() => void retry(!error.handoff)}>
              {error.handoff ? 'Reintentar' : 'Continuar con Google'}
            </Button>
            {error.handoff ? (
              <Button className="mt-3 w-full" variant="secondary" disabled={retrying} onClick={() => void retry(true)}>
                Volver a Google
              </Button>
            ) : null}
            <Link
              to={operationId ? '/register' : returnTo === '/invitations/accept' ? '/login?return_to=/invitations/accept' : '/login'}
              className="mt-4 inline-flex text-sm font-semibold text-indigo-300 hover:text-indigo-200"
            >
              {operationId ? 'Volver al registro' : 'Volver a iniciar sesión'}
            </Link>
          </>
        ) : (
          <p className="text-sm text-slate-400" role="status">
            Validando tu cuenta de Google…
          </p>
        )}
      </section>
    </main>
  );
}
