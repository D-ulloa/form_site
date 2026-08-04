import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertInline } from '../components/ui/AlertInline.tsx';
import {
  completeGoogleLogin,
  type AdminAuthError,
} from '../features/contracts/services/adminAuthApi.ts';

export function GoogleAuthCallbackPage() {
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void completeGoogleLogin()
      .then(() => navigate('/', { replace: true }))
      .catch((caughtError) => {
        const authError = caughtError as AdminAuthError;
        setError(authError.message || 'No se pudo completar el acceso con Google.');
      });
  }, [navigate]);

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

