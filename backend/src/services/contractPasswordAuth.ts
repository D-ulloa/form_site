import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const CONTRACT_PASSWORD_SESSION_COOKIE = 'contract_password_session';
export const CONTRACT_PASSWORD_SESSION_VERSION = 'spec25-containment-v1';
const STANDARD_SESSION_TTL_SECONDS = 8 * 60 * 60;
const REMEMBERED_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface ContractPasswordSession {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly isAdmin: boolean;
  readonly sessionVersion: string;
  readonly expiresAt: number;
}

export interface ContractPasswordCredentials {
  readonly email: string;
  readonly password: string;
  readonly name?: string;
  readonly company?: string;
  readonly role?: string;
  readonly rememberMe?: boolean;
}

export interface ContractGoogleAccessToken {
  readonly accessToken: string;
  readonly rememberMe?: boolean;
}

export type ContractPasswordSessionData = Omit<
  ContractPasswordSession,
  'expiresAt' | 'sessionVersion'
>;

export class ContractPasswordAuthConfigurationError extends Error {
  constructor() {
    super(
      'Supabase password authentication requires SUPABASE_URL, '
      + 'SUPABASE_SERVICE_ROLE_KEY, and a CONTRACT_TOKEN_SECRET of at least 32 characters.',
    );
    this.name = 'ContractPasswordAuthConfigurationError';
  }
}

export class ContractPasswordAuthError extends Error {
  readonly code: 'invalid_credentials' | 'email_in_use' | 'not_admin' | 'registration_closed';

  constructor(
    code: 'invalid_credentials' | 'email_in_use' | 'not_admin' | 'registration_closed',
    message: string,
  ) {
    super(message);
    this.name = 'ContractPasswordAuthError';
    this.code = code;
  }
}

function getServiceClient(environment: NodeJS.ProcessEnv): SupabaseClient {
  const url = environment.SUPABASE_URL?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new ContractPasswordAuthConfigurationError();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type ContractAuthClientFactory = (environment: NodeJS.ProcessEnv) => SupabaseClient;

function sessionSecret(environment: NodeJS.ProcessEnv): string {
  const secret = environment.CONTRACT_SESSION_SECRET?.trim()
    || environment.CONTRACT_TOKEN_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new ContractPasswordAuthConfigurationError();
  }
  return secret;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decode<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function sign(value: string, environment: NodeJS.ProcessEnv): string {
  return createHmac('sha256', sessionSecret(environment))
    .update(value, 'utf8')
    .digest('base64url');
}

function signedValue(value: string, environment: NodeJS.ProcessEnv): string {
  return `${value}.${sign(value, environment)}`;
}

function verifySignedValue(value: string, environment: NodeJS.ProcessEnv): string | null {
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = Buffer.from(sign(payload, environment));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return payload;
}

function serializeCookie(
  value: string,
  environment: NodeJS.ProcessEnv,
  maxAgeSeconds?: number,
): string {
  const attributes = [
    `${CONTRACT_PASSWORD_SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (environment.NODE_ENV === 'production') attributes.push('Secure');
  if (maxAgeSeconds !== undefined) attributes.push(`Max-Age=${maxAgeSeconds}`);
  return attributes.join('; ');
}

export function clearContractPasswordSessionCookie(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return [
    `${CONTRACT_PASSWORD_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(environment.NODE_ENV === 'production' ? ['Secure'] : []),
  ].join('; ');
}

function cookiesFromRequest(req: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (req.get('Cookie') ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    try {
      cookies.set(
        part.slice(0, separator).trim(),
        decodeURIComponent(part.slice(separator + 1).trim()),
      );
    } catch {
      // Ignore malformed caller-controlled cookie fragments.
    }
  }
  return cookies;
}

export function getContractPasswordSession(
  req: Request,
  environment: NodeJS.ProcessEnv = process.env,
): ContractPasswordSession | null {
  const raw = cookiesFromRequest(req).get(CONTRACT_PASSWORD_SESSION_COOKIE);
  if (!raw) return null;
  const payload = verifySignedValue(raw, environment);
  if (!payload) return null;
  const session = decode<ContractPasswordSession>(payload);
  if (
    !session
    || typeof session.userId !== 'string'
    || typeof session.email !== 'string'
    || typeof session.name !== 'string'
    || typeof session.isAdmin !== 'boolean'
    || session.sessionVersion !== (
      environment.CONTRACT_SESSION_VERSION?.trim()
      || CONTRACT_PASSWORD_SESSION_VERSION
    )
    || typeof session.expiresAt !== 'number'
    || !Number.isSafeInteger(session.expiresAt)
    || session.expiresAt <= Math.floor(Date.now() / 1000)
  ) return null;
  return session;
}

export function serializeContractPasswordSessionCookie(
  session: ContractPasswordSessionData,
  environment: NodeJS.ProcessEnv = process.env,
  rememberMe = false,
): string {
  const ttlSeconds = rememberMe
    ? REMEMBERED_SESSION_TTL_SECONDS
    : STANDARD_SESSION_TTL_SECONDS;
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sessionVersion = environment.CONTRACT_SESSION_VERSION?.trim()
    || CONTRACT_PASSWORD_SESSION_VERSION;
  return serializeCookie(
    signedValue(encode({ ...session, sessionVersion, expiresAt }), environment),
    environment,
    rememberMe ? ttlSeconds : undefined,
  );
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeName(value: unknown, email: string): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 256)
    : email;
}

function isGoogleUser(user: {
  app_metadata?: Record<string, unknown>;
  identities?: ReadonlyArray<{ provider?: string | null }> | null;
}): boolean {
  const provider = user.app_metadata?.provider;
  const providers = user.app_metadata?.providers;
  return provider === 'google'
    || (Array.isArray(providers) && providers.includes('google'))
    || Boolean(user.identities?.some((identity) => identity.provider === 'google'));
}

async function isAdminUser(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from('contract_admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Supabase admin role lookup failed: ${error.message}`);
  return Boolean(data);
}

async function makeSession(
  client: SupabaseClient,
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  },
): Promise<ContractPasswordSessionData> {
  const email = normalizeEmail(user.email ?? '');
  if (!user.id || !email) {
    throw new ContractPasswordAuthError(
      'invalid_credentials',
      'La cuenta no tiene un correo electrónico válido.',
    );
  }
  if (!(await isAdminUser(client, user.id))) {
    throw new ContractPasswordAuthError(
      'not_admin',
      'La cuenta no está habilitada para administrar contratos.',
    );
  }
  return {
    userId: user.id,
    email,
    name: normalizeName(
      user.user_metadata?.full_name ?? user.user_metadata?.name,
      email,
    ),
    isAdmin: true,
  };
}

export async function registerContractUser(
  credentials: ContractPasswordCredentials,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ContractPasswordSessionData> {
  if (
    environment.NODE_ENV !== 'development'
    || environment.CONTRACT_ALLOW_SYNTHETIC_REGISTRATION !== 'true'
  ) {
    throw new ContractPasswordAuthError(
      'registration_closed',
      'El registro está cerrado. Solicitá una invitación al administrador.',
    );
  }
  const client = getServiceClient(environment);
  const email = normalizeEmail(credentials.email);
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: credentials.password,
    email_confirm: true,
    user_metadata: {
      main_page_registration: 'true',
      full_name: credentials.name?.trim() || email,
      ...(credentials.company?.trim() ? { company: credentials.company.trim() } : {}),
      ...(credentials.role?.trim() ? { role: credentials.role.trim() } : {}),
    },
  });
  if (error || !data.user) {
    if (error?.message.toLowerCase().includes('already') || error?.code === 'email_exists') {
      throw new ContractPasswordAuthError(
        'email_in_use',
        'Ya existe una cuenta con ese correo electrónico.',
      );
    }
    throw new Error(error?.message ?? 'Supabase no devolvió el usuario creado.');
  }
  return makeSession(client, data.user);
}

export async function loginContractUser(
  credentials: ContractPasswordCredentials,
  environment: NodeJS.ProcessEnv = process.env,
  clientFactory: ContractAuthClientFactory = getServiceClient,
): Promise<ContractPasswordSessionData> {
  const authClient = clientFactory(environment);
  const { data, error } = await authClient.auth.signInWithPassword({
    email: normalizeEmail(credentials.email),
    password: credentials.password,
  });
  if (error || !data.user) {
    throw new ContractPasswordAuthError(
      'invalid_credentials',
      'El correo o la contraseña no son correctos.',
    );
  }
  // signInWithPassword replaces the client's Authorization header with the
  // user's JWT. Use a fresh service-role client for the administrator lookup,
  // because RLS intentionally exposes no role rows to browser users.
  return makeSession(clientFactory(environment), data.user);
}

/**
 * Convert a verified Supabase Google session into the same signed application
 * session used by password authentication. The access token is verified by
 * Supabase Auth; it is never stored in the application cookie.
 */
export async function loginContractGoogleUser(
  credentials: ContractGoogleAccessToken,
  environment: NodeJS.ProcessEnv = process.env,
  clientFactory: ContractAuthClientFactory = getServiceClient,
): Promise<ContractPasswordSessionData> {
  const accessToken = credentials.accessToken.trim();
  if (!accessToken || accessToken.length > 16384) {
    throw new ContractPasswordAuthError(
      'invalid_credentials',
      'No se pudo validar la cuenta de Google.',
    );
  }

  const client = clientFactory(environment);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user || !isGoogleUser(data.user)) {
    throw new ContractPasswordAuthError(
      'invalid_credentials',
      'No se pudo validar la cuenta de Google.',
    );
  }

  return makeSession(client, data.user);
}
