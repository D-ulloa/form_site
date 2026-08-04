import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0754c7] text-white shadow-sm">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.5" />
          <path strokeLinecap="round" d="M9 3.5v3M15 3.5v3M9 17.5v3M15 17.5v3M3.5 9h3M17.5 9h3M3.5 15h3M17.5 15h3" />
        </svg>
      </div>
      <span className="text-lg font-semibold tracking-tight text-slate-900">OPEV-H</span>
    </div>
  );
}

export function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
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
        await registerAdmin({ name, email, password, company, role, rememberMe: true });
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

  const switchPath = isRegister ? '/login' : '/register';
  const switchLabel = isRegister ? 'Iniciar sesión' : 'Crear cuenta';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eef5fb] px-4 py-10 text-slate-900 sm:px-6">
      <section className="w-full max-w-[468px] rounded-2xl border border-[#d4e0ec] bg-white px-7 py-8 shadow-[0_12px_28px_rgba(35,70,105,0.12)] sm:px-8 sm:py-9" aria-labelledby="auth-title">
        <Brand />
        <p className="mt-7 text-[11px] font-medium uppercase tracking-wide text-[#37577b]">
          {isRegister ? 'Cuenta OPEV-H' : 'Acceso al producto'}
        </p>
        <h1 id="auth-title" className="mt-5 text-[23px] font-bold tracking-tight text-slate-950">
          {isRegister ? 'Crea tu cuenta' : 'Inicia sesión'}
        </h1>
        <p className="mt-2 max-w-[390px] text-sm leading-5 text-[#365579]">
          {isRegister
            ? 'Accede a OPEV-H para crear workspaces, conversar con el Assistant y preparar entregables con IA.'
            : 'Continúa tu trabajo en OPEV-H con workspaces, documentos, Assistant y perfiles de IA especializados.'}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          {error && <AlertInline variant="error" title="No se pudo completar la operación">{error}</AlertInline>}

          {isRegister && (
            <Input
              label="Nombre completo"
              id="auth-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej.: Juan Pérez"
              required
              className="border-[#b8cce2] bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#0754c7] focus:ring-[#0754c7]/15"
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
            autoComplete="email"
            className="border-[#b8cce2] bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#0754c7] focus:ring-[#0754c7]/15"
          />

          {isRegister && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Empresa"
                id="auth-company"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="Nombre de empresa"
                autoComplete="organization"
                className="border-[#b8cce2] bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#0754c7] focus:ring-[#0754c7]/15"
              />
              <Input
                label="Cargo o rol"
                id="auth-role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="Ej.: Administrador"
                className="border-[#b8cce2] bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#0754c7] focus:ring-[#0754c7]/15"
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
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            className="border-[#b8cce2] bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#0754c7] focus:ring-[#0754c7]/15"
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
              autoComplete="new-password"
              className="border-[#b8cce2] bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#0754c7] focus:ring-[#0754c7]/15"
            />
          )}

          {!isRegister && (
            <label className="flex items-center gap-2 text-xs text-[#365579]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 rounded border-[#9bb4cf] text-[#0754c7] accent-[#0754c7]"
              />
              Recordarme en este navegador
            </label>
          )}

          {isRegister && (
            <label className="flex items-start gap-2 text-xs leading-4 text-[#365579]">
              <input type="checkbox" defaultChecked required className="mt-0.5 h-4 w-4 rounded border-[#9bb4cf] accent-[#0754c7]" />
              Acepto crear una cuenta para acceder a los workspaces de OPEV-H.
            </label>
          )}

          <Button
            type="submit"
            size="lg"
            loading={isPending}
            className="w-full rounded-lg bg-[#0754c7] text-sm shadow-none hover:bg-[#0645a5]"
          >
            {isRegister ? 'Registrarse' : 'Iniciar sesión'}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-[#365579]">
          {isRegister ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
          <Link to={switchPath} state={{ from: location.pathname }} className="font-semibold text-[#0754c7] hover:underline">
            {switchLabel}
          </Link>
        </p>
      </section>
    </main>
  );
}
