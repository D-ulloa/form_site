import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertInline } from '../components/ui/AlertInline.tsx';
import {
  completeGoogleLogin,
  SELF_SERVICE_OPERATION_STORAGE_KEY,
  type AdminAuthError,
} from '../features/contracts/services/adminAuthApi.ts';
import { clearContractAdminQueryCache } from '../features/contracts/services/contractAdminQueryCache.ts';
import { useAuthentication } from '../app/contexts/AuthenticationContext.tsx';

export function GoogleAuthCallbackPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authentication = useAuthentication();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('return_to') === '/invitations/accept' ? '/invitations/accept' : '/';
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void completeGoogleLogin()
      .then(async (session) => {
        clearContractAdminQueryCache(queryClient);
        await authentication.refresh();
        window.dispatchEvent(new Event('form-site-auth-refresh'));
        const destination = 'onboarding' in session
          ? `/t/${encodeURIComponent(session.onboarding.organization_slug)}` : returnTo;
        if ('onboarding' in session) sessionStorage.removeItem(SELF_SERVICE_OPERATION_STORAGE_KEY);
        navigate(destination, { replace: true });
      })
      .catch((caughtError) => {
        const authError = caughtError as AdminAuthError;
        setError(authError.message || 'No se pudo completar el acceso con Google.');
      });
  }, [authentication, navigate, queryClient, returnTo]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--bg-base)] px-6 py-16">
      <section className="surface-elevated w-full max-w-md rounded-2xl p-8 text-center shadow-2xl shadow-black/30">
        {error ? (
          <>
            <AlertInline variant="error" title="No se pudo iniciar sesión">
              {error}
            </AlertInline>
            <Link
              to="/login"
              className="mt-6 inline-flex rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Volver a iniciar sesión
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
