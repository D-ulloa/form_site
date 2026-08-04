import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertInline } from '../components/ui/AlertInline.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import {
  fetchAdminSession,
  loginAdmin,
  registerAdmin,
  type AdminAuthError,
} from '../features/contracts/services/adminAuthApi.ts';

type AuthMode = 'login' | 'register';

interface AuthPageProps {
  mode: AuthMode;
}

function ProductMark() {
  return (
    <div
      className="accent-gradient flex h-10 w-10 items-center justify-center rounded-xl shadow-lg shadow-indigo-700/25"
      aria-hidden="true"
    >
      <svg
        className="h-5 w-5 text-white"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        viewBox="0 0 24 24"
      >
        <rect x="7" y="7" width="10" height="10" rx="1.5" />
        <path
          strokeLinecap="round"
          d="M9 3.5v3M15 3.5v3M9 17.5v3M15 17.5v3M3.5 9h3M17.5 9h3M3.5 15h3M17.5 15h3"
        />
      </svg>
    </div>
  );
}

export function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate();
  const isRegister = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = isRegister ? 'Registrarse' : 'Iniciar sesión';
    return () => { document.title = previousTitle; };
  }, [isRegister]);

  useEffect(() => {
    let active = true;
    void fetchAdminSession()
      .then((session) => {
        if (active && session) navigate('/', { replace: true });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (isRegister && password !== passwordConfirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setIsPending(true);
    try {
      if (isRegister) {
        await registerAdmin({ name, email, password, company, role });
      } else {
        await loginAdmin({ email, password, rememberMe });
      }
      navigate('/', { replace: true });
    } catch (caughtError) {
      const authError = caughtError as AdminAuthError;
      setError(authError.message || 'No se pudo completar la autenticación.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--bg-base)] px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute left-1/2 top-[-14rem] h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-12rem] right-[-8rem] h-[25rem] w-[25rem] rounded-full bg-cyan-500/[0.07] blur-3xl" />

      <section
        className="surface-elevated relative w-full max-w-[470px] rounded-2xl px-6 py-7 shadow-2xl shadow-black/30 sm:px-8 sm:py-9"
        aria-labelledby="auth-title"
      >
        <ProductMark />

        <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-400">
          {isRegister ? 'Nueva cuenta' : 'Acceso seguro'}
        </p>
        <h1 id="auth-title" className="mt-3 text-2xl font-bold tracking-tight text-slate-100">
          {isRegister ? 'Creá tu cuenta' : 'Iniciá sesión'}
        </h1>
        <p className="mt-2 max-w-[390px] text-sm leading-6 text-slate-400">
          {isRegister
            ? 'Registrate para crear y administrar propiedades y contratos.'
            : 'Ingresá para continuar gestionando propiedades y contratos.'}
        </p>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit} noValidate>
          {error && (
            <AlertInline variant="error" title="No se pudo completar la operación">
              {error}
            </AlertInline>
          )}

          {isRegister && (
            <Input
              label="Nombre completo"
              id="auth-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej.: Ana Pérez"
              required
              maxLength={256}
              autoComplete="name"
            />
          )}

          <Input
            label="Correo electrónico"
            id="auth-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nombre@empresa.com"
            required
            maxLength={320}
            autoComplete="email"
          />

          {isRegister && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Empresa"
                id="auth-company"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="Nombre de empresa"
                maxLength={256}
                autoComplete="organization"
              />
              <Input
                label="Cargo o rol"
                id="auth-role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="Ej.: Administrador"
                maxLength={256}
                autoComplete="organization-title"
              />
            </div>
          )}

          <Input
            label="Contraseña"
            id="auth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mínimo 8 caracteres"
            required
            minLength={8}
            maxLength={1024}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />

          {isRegister && (
            <Input
              label="Confirmar contraseña"
              id="auth-password-confirmation"
              type="password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              placeholder="Repetí tu contraseña"
              required
              minLength={8}
              maxLength={1024}
              autoComplete="new-password"
            />
          )}

          {!isRegister && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 accent-indigo-500"
              />
              Recordarme en este navegador
            </label>
          )}

          {isRegister && (
            <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-slate-400">
              <input
                type="checkbox"
                defaultChecked
                required
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 accent-indigo-500"
              />
              Acepto crear una cuenta para acceder a las herramientas de gestión.
            </label>
          )}

          <Button type="submit" size="lg" loading={isPending} className="w-full">
            {isRegister ? 'Registrarse' : 'Iniciar sesión'}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          {isRegister ? '¿Ya tenés cuenta?' : '¿No tenés cuenta?'}{' '}
          <Link
            to={isRegister ? '/login' : '/register'}
            className="font-semibold text-indigo-400 transition-colors hover:text-indigo-300"
          >
            {isRegister ? 'Iniciar sesión' : 'Crear cuenta'}
          </Link>
        </p>
      </section>
    </main>
  );
}
