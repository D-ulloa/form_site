import axios from 'axios';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const API_PREFIX = import.meta.env.DEV ? '' : '/_/backend';
const AUTH_API_PATH = `${API_PREFIX}/api/auth`;

export interface AdminSession {
  readonly authenticated: true;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
  };
  readonly session?: {
    readonly id: string;
    readonly auth_method: 'password' | 'google' | 'sso' | 'recovery';
    readonly assurance_level: 'aal1' | 'aal2';
    readonly created_at: string;
    readonly absolute_expires_at: string;
    readonly idle_expires_at: string | null;
    readonly remembered: boolean;
  };
  readonly memberships?: readonly OrganizationMembershipSummary[];
}

export interface OrganizationMembershipSummary {
  readonly organization_id: string;
  readonly organization_slug: string;
  readonly organization_display_name: string;
  readonly organization_status: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
  readonly membership_id: string;
  readonly membership_status: 'active' | 'suspended' | 'removed';
  readonly role: 'owner' | 'admin' | 'member' | 'viewer';
  readonly capabilities: readonly string[];
}

export interface PasswordAuthInput {
  readonly email: string;
  readonly password: string;
  readonly rememberMe?: boolean;
}

export interface RegistrationInput extends PasswordAuthInput {
  readonly name: string;
  readonly company?: string;
  readonly role?: string;
}

export interface GoogleAuthInput {
  readonly accessToken: string;
  readonly rememberMe?: boolean;
}

export class AdminAuthError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AdminAuthError';
    this.status = status;
  }
}

function authError(error: unknown, fallback: string): AdminAuthError {
  if (axios.isAxiosError(error)) {
    const message = typeof error.response?.data?.message === 'string'
      ? error.response.data.message
      : fallback;
    return new AdminAuthError(message, error.response?.status);
  }
  return error instanceof AdminAuthError
    ? error
    : new AdminAuthError(fallback);
}

let supabaseAuthClient: SupabaseClient | null = null;

function getSupabaseAuthClient(): SupabaseClient {
  if (supabaseAuthClient) return supabaseAuthClient;

  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new AdminAuthError(
      'El acceso con Google no está configurado en este entorno.',
    );
  }

  supabaseAuthClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  return supabaseAuthClient;
}

export async function startGoogleLogin(returnTo = '/'): Promise<void> {
  try {
    const { error } = await getSupabaseAuthClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: new URL(returnTo === '/invitations/accept'
          ? '/auth/callback?return_to=/invitations/accept' : '/auth/callback', window.location.origin).toString(),
      },
    });
    if (error) throw new AdminAuthError(error.message);
  } catch (error) {
    throw authError(error, 'No se pudo iniciar el acceso con Google.');
  }
}

export async function completeGoogleLogin(
  rememberMe = true,
): Promise<AdminSession> {
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) {
    const message = new URLSearchParams(window.location.search)
      .get('error_description');
    throw new AdminAuthError(
      message ?? 'Google no devolvió un código de acceso.',
    );
  }

  try {
    const { data, error } = await getSupabaseAuthClient().auth.exchangeCodeForSession(code);
    if (error || !data.session?.access_token) {
      throw new AdminAuthError(error?.message ?? 'No se pudo validar la cuenta de Google.');
    }
    const session = await establishGoogleSession({
      accessToken: data.session.access_token,
      rememberMe,
    });
    await getSupabaseAuthClient().auth.signOut();
    return session;
  } catch (error) {
    try {
      await getSupabaseAuthClient().auth.signOut();
    } catch {
      // The application cookie is not established when the exchange fails.
    }
    throw authError(error, 'No se pudo completar el acceso con Google.');
  }
}

export async function fetchAdminSession(): Promise<AdminSession | null> {
  try {
    const response = await axios.get<{
      authenticated: boolean;
      user?: AdminSession['user'];
      session?: AdminSession['session'];
      memberships?: AdminSession['memberships'];
    }>(`${AUTH_API_PATH}/session`, { withCredentials: true });
    if (!response.data.authenticated || !response.data.user || !response.data.session) return null;
    return { authenticated: true, user: response.data.user, session: response.data.session,
      memberships: response.data.memberships ?? [] };
  } catch (error) {
    throw authError(error, 'No se pudo comprobar la sesión.');
  }
}

export async function loginAdmin(input: PasswordAuthInput): Promise<AdminSession> {
  try {
    const response = await axios.post<AdminSession>(
      `${AUTH_API_PATH}/login`,
      { ...input, remember_me: input.rememberMe },
      { withCredentials: true },
    );
    return response.data;
  } catch (error) {
    throw authError(error, 'No se pudo iniciar sesión.');
  }
}

export async function registerAdmin(input: RegistrationInput): Promise<AdminSession> {
  try {
    const response = await axios.post<AdminSession>(
      `${AUTH_API_PATH}/register`,
      input,
      { withCredentials: true },
    );
    return response.data;
  } catch (error) {
    throw authError(error, 'No se pudo crear la cuenta.');
  }
}

export async function establishGoogleSession(input: GoogleAuthInput): Promise<AdminSession> {
  try {
    const response = await axios.post<AdminSession>(
      `${AUTH_API_PATH}/google/session`,
      input,
      { withCredentials: true },
    );
    return response.data;
  } catch (error) {
    throw authError(error, 'No se pudo completar el acceso con Google.');
  }
}

export async function logoutAdmin(): Promise<void> {
  try {
    await axios.post(`${AUTH_API_PATH}/logout`, {}, { withCredentials: true,
      headers: { 'X-CSRF-Token': readCookie('form_site_csrf') } });
  } catch (error) {
    throw authError(error, 'No se pudo cerrar la sesión.');
  }
}

function readCookie(name: string): string {
  const prefix = `${name}=`;
  const match = document.cookie.split(';').map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : '';
}
