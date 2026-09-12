import axios from 'axios';
import type { OrganizationRole } from '../../organizations/types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertGoogleOAuthStorageAvailable, createGoogleOAuthStorage, GoogleOAuthStorageError,
} from './googleOAuthStorage.ts';

const API_PREFIX = import.meta.env.DEV ? '' : '/_/backend';
const AUTH_API_PATH = `${API_PREFIX}/api/auth`;
export const SELF_SERVICE_OPERATION_STORAGE_KEY = 'form_site_self_service_operation';

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
  readonly role: OrganizationRole;
  readonly capabilities: readonly string[];
}

export interface PasswordAuthInput {
  readonly email: string;
  readonly password: string;
  readonly rememberMe?: boolean;
}

export interface RegistrationInput extends PasswordAuthInput {
  readonly operationId: string;
  readonly fullName: string;
  readonly organizationName: string;
  readonly passwordConfirmation: string;
  readonly termsAccepted: boolean;
}

export interface GoogleRegistrationIntentInput {
  readonly operationId: string;
  readonly fullName: string;
  readonly email: string;
  readonly organizationName: string;
  readonly termsAccepted: boolean;
}

export interface SelfServiceSession extends AdminSession {
  readonly onboarding: {
    readonly operation_id: string;
    readonly organization_slug: string;
    readonly email_verification_required: false;
  };
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

export class GoogleAuthError extends AdminAuthError {
  readonly stage: 'oauth' | 'handoff';

  constructor(message: string, stage: 'oauth' | 'handoff', status?: number) {
    super(message, status);
    this.name = 'GoogleAuthError';
    this.stage = stage;
  }
}

const GOOGLE_RESTART_MESSAGE = 'El acceso con Google venció o se perdió. Volvé a continuar con Google desde esta misma pestaña.';

function authError(error: unknown, fallback: string): AdminAuthError {
  if (error instanceof GoogleOAuthStorageError) return new GoogleAuthError(error.message, 'oauth');
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
let googleStart: Promise<void> | null = null;
type GoogleSession = AdminSession | SelfServiceSession;
let googleCompletion: { code: string | null; context: string; promise: Promise<GoogleSession> } | null = null;
let googleHandoff: {
  accessToken: string; operationId: string | null; rememberMe: boolean;
  promise: Promise<GoogleSession> | null;
} | null = null;

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
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      storage: createGoogleOAuthStorage(),
    },
  });
  return supabaseAuthClient;
}

export function startGoogleLogin(returnTo = '/', selfServiceOperationId?: string): Promise<void> {
  if (googleStart) return googleStart;
  googleStart = beginGoogleLogin(returnTo, selfServiceOperationId).finally(() => { googleStart = null; });
  return googleStart;
}

async function beginGoogleLogin(returnTo: string, selfServiceOperationId?: string): Promise<void> {
  try {
    assertGoogleOAuthStorageAvailable();
    const client = getSupabaseAuthClient();
    await client.auth.initialize();
    await clearTemporaryGoogleSession();
    googleCompletion = null;
    googleHandoff = null;
    const callback = new URL('/auth/callback', window.location.origin);
    if (returnTo === '/invitations/accept') callback.searchParams.set('return_to', returnTo);
    if (selfServiceOperationId) callback.searchParams.set('self_service_operation', selfServiceOperationId);
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callback.toString(),
        skipBrowserRedirect: true,
      },
    });
    if (error) throw new AdminAuthError(error.message);
    if (!data.url) throw new AdminAuthError('No se pudo iniciar el acceso con Google.');
    // signInWithOAuth has finished writing the verifier before navigation.
    window.location.assign(data.url);
  } catch (error) {
    throw authError(error, 'No se pudo iniciar el acceso con Google.');
  }
}

export function completeGoogleLogin(
  rememberMe = true,
): Promise<GoogleSession> {
  const callback = new URL(window.location.href);
  const code = callback.searchParams.get('code');
  const context = googleCallbackContext(callback);
  if (googleCompletion?.context === context && (!code || googleCompletion.code === code)) {
    return googleCompletion.promise;
  }
  const promise = finishGoogleLogin(callback, rememberMe);
  googleCompletion = { code, context, promise };
  return promise;
}

function googleCallbackContext(url: URL): string {
  return JSON.stringify([url.origin, url.pathname, url.searchParams.get('self_service_operation'),
    url.searchParams.get('return_to')]);
}

function clearGoogleCallbackCode(callback: URL): void {
  const current = new URL(window.location.href);
  if (googleCallbackContext(current) !== googleCallbackContext(callback)) return;
  if (current.searchParams.has('code') && current.searchParams.get('code') !== callback.searchParams.get('code')) return;
  for (const key of ['code', 'sb_flow_id', 'error', 'error_code', 'error_description']) current.searchParams.delete(key);
  if (new URLSearchParams(current.hash.slice(1)).has('error')) current.hash = '';
  window.history.replaceState(window.history.state, '', current);
}

async function clearTemporaryGoogleSession(): Promise<void> {
  try {
    // Revoke only this temporary Supabase session, never other devices.
    await getSupabaseAuthClient().auth.signOut({ scope: 'local' });
  } catch {
    // Cleanup must not turn an established application session into a failure.
  }
}

async function recoverGoogleApplicationSession(operationId: string | null): Promise<GoogleSession | null> {
  const session = await fetchAdminSession();
  if (!session) return null;
  return operationId ? recoverSelfServiceRegistration(operationId) : session;
}

async function finishGoogleLogin(callback: URL, rememberMe: boolean): Promise<GoogleSession> {
  const code = callback.searchParams.get('code');
  const operationId = callback.searchParams.get('self_service_operation');
  const hash = new URLSearchParams(callback.hash.slice(1));
  if (callback.searchParams.has('error') || hash.has('error')) {
    clearGoogleCallbackCode(callback);
    throw new GoogleAuthError('Google no autorizó el acceso. Volvé a intentarlo.', 'oauth');
  }
  if (!code) {
    // After a reload, a consumed code is gone. Recover a completed backend
    // handoff from its HttpOnly cookie, or start a fresh OAuth attempt.
    const recovered = await recoverGoogleApplicationSession(operationId);
    if (recovered) return recovered;
    throw new GoogleAuthError(GOOGLE_RESTART_MESSAGE, 'oauth');
  }
  try {
    assertGoogleOAuthStorageAvailable();
    const { data, error } = await getSupabaseAuthClient().auth.exchangeCodeForSession(code);
    if (error || !data.session?.access_token) {
      throw new GoogleAuthError(GOOGLE_RESTART_MESSAGE, 'oauth');
    }
    googleHandoff = { accessToken: data.session.access_token, operationId, rememberMe, promise: null };
  } catch (error) {
    await clearTemporaryGoogleSession();
    throw authError(error, 'No se pudo completar el acceso con Google.');
  } finally {
    clearGoogleCallbackCode(callback);
  }
  return finishGoogleHandoff();
}

function finishGoogleHandoff(recover = false): Promise<GoogleSession> {
  const pending = googleHandoff;
  if (!pending) return Promise.reject(new GoogleAuthError(GOOGLE_RESTART_MESSAGE, 'oauth'));
  if (pending.promise) return pending.promise;
  pending.promise = (async () => {
    try {
      const existing = recover ? await recoverGoogleApplicationSession(pending.operationId) : null;
      const session = existing ?? (pending.operationId
        ? await establishGoogleRegistration({ ...pending, operationId: pending.operationId })
        : await establishGoogleSession({ accessToken: pending.accessToken, rememberMe: pending.rememberMe }));
      await clearTemporaryGoogleSession();
      googleHandoff = null;
      return session;
    } catch (error) {
      pending.promise = null;
      const failure = authError(error, 'No se pudo completar el registro. Volvé a intentarlo.');
      throw new GoogleAuthError(failure.message, 'handoff', failure.status);
    }
  })();
  return pending.promise;
}

export function retryGoogleHandoff(): Promise<GoogleSession> {
  const promise = finishGoogleHandoff(true);
  if (googleCompletion) googleCompletion.promise = promise;
  return promise;
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

export async function registerAdmin(input: RegistrationInput): Promise<SelfServiceSession> {
  try {
    const response = await axios.post<SelfServiceSession>(
      `${AUTH_API_PATH}/register`,
      {
        operation_id: input.operationId, full_name: input.fullName, email: input.email,
        organization_name: input.organizationName, password: input.password,
        password_confirmation: input.passwordConfirmation, terms_accepted: input.termsAccepted,
        remember_me: input.rememberMe,
      },
      { withCredentials: true },
    );
    return response.data;
  } catch (error) {
    throw authError(error, 'No se pudo crear la cuenta.');
  }
}

export async function startGoogleRegistration(input: GoogleRegistrationIntentInput): Promise<void> {
  try {
    assertGoogleOAuthStorageAvailable();
    try { sessionStorage.setItem(SELF_SERVICE_OPERATION_STORAGE_KEY, input.operationId); }
    catch { throw new GoogleOAuthStorageError(); }
    const response = await axios.post<{ operation_id: string }>(`${AUTH_API_PATH}/register/google/intent`, {
      operation_id: input.operationId, full_name: input.fullName, email: input.email,
      organization_name: input.organizationName, terms_accepted: input.termsAccepted,
    }, { withCredentials: true });
    await startGoogleLogin('/', response.data.operation_id);
  } catch (error) {
    throw authError(error, 'No se pudo iniciar el registro con Google.');
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

async function establishGoogleRegistration(input: GoogleAuthInput & { readonly operationId: string }): Promise<SelfServiceSession> {
  try {
    const response = await axios.post<SelfServiceSession>(`${AUTH_API_PATH}/google/register`, {
      access_token: input.accessToken, operation_id: input.operationId, remember_me: input.rememberMe,
    }, { withCredentials: true });
    return response.data;
  } catch (error) {
    throw authError(error, 'No se pudo completar el registro con Google.');
  }
}

export async function recoverSelfServiceRegistration(operationId: string): Promise<SelfServiceSession> {
  try {
    const response = await axios.post<SelfServiceSession>(
      `${AUTH_API_PATH}/register/operations/${encodeURIComponent(operationId)}/recover`, {},
      { withCredentials: true, headers: { 'X-CSRF-Token': readCookie('form_site_csrf') } },
    );
    return response.data;
  } catch (error) {
    throw authError(error, 'No se pudo recuperar el registro pendiente.');
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
