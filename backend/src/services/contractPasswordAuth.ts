import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const CONTRACT_PASSWORD_SESSION_COOKIE = 'contract_password_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface ContractPasswordSession {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly isAdmin: boolean;
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

export class ContractPasswordAuthConfigurationError extends Error {
  constructor() {
    super('Supabase password authentication requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    this.name = 'ContractPasswordAuthConfigurationError';
  }
}

export class ContractPasswordAuthError extends Error {
  readonly code: 'invalid_credentials' | 'email_in_use' | 'not_admin';

  constructor(
    code: 'invalid_credentials' | 'email_in_use' | 'not_admin',
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

function sessionSecret(environment: NodeJS.ProcessEnv): string {
  const secret = environment.CONTRACT_TOKEN_SECRET?.trim();
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
  return createHmac('sha256', sessionSecret(environment)).update(value, 'utf8').digest('base64url');
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
  rememberMe: boolean,
): string {
  const attributes = [
    `${CONTRACT_PASSWORD_SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (environment.NODE_ENV === 'production') attributes.push('Secure');
  if (rememberMe) attributes.push(`Max-Age=${30 * 24 * 60 * 60}`);
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
    || typeof session.expiresAt !== 'number'
    || session.expiresAt <= Math.floor(Date.now() / 1000)
  ) return null;
  return session;
}

export function serializeContractPasswordSessionCookie(
  session: Omit<ContractPasswordSession, 'expiresAt'>,
  environment: NodeJS.ProcessEnv = process.env,
  rememberMe = false,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  return serializeCookie(
    signedValue(encode({ ...session, expiresAt }), environment),
    environment,
    rememberMe,
  );
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeName(value: unknown, email: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 256) : email;
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

function isAdminMetadata(value: unknown): boolean {
  return typeof value === 'object'
    && value !== null
    && (value as { role?: unknown }).role === 'admin';
}

async function makeSession(
  client: SupabaseClient,
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  },
): Promise<Omit<ContractPasswordSession, 'expiresAt'>> {
  const email = normalizeEmail(user.email ?? '');
  if (!user.id || !email) throw new ContractPasswordAuthError('invalid_credentials', 'La cuenta no tiene un email válido.');
  let isAdmin = isAdminMetadata(user.app_metadata);
  try {
    isAdmin ||= await isAdminUser(client, user.id);
  } catch (error) {
    // The metadata claim keeps a just-created account usable while a deployment
    // is applying the audit table migration. Once present, the table remains
    // the durable source of the grant.
    if (!isAdmin || !(error instanceof Error && /contract_admin_users|relation .* does not exist/iu.test(error.message))) {
      throw error;
    }
  }
  if (!isAdmin) {
    throw new ContractPasswordAuthError('not_admin', 'La cuenta no está habilitada para administrar contratos.');
  }
  return {
    userId: user.id,
    email,
    name: normalizeName(user.user_metadata?.full_name, email),
    isAdmin,
  };
}

export async function registerContractUser(
  credentials: ContractPasswordCredentials,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<Omit<ContractPasswordSession, 'expiresAt'>> {
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
    app_metadata: { role: 'admin' },
  });
  if (error || !data.user) {
    if (error?.message.toLowerCase().includes('already') || error?.code === 'email_exists') {
      throw new ContractPasswordAuthError('email_in_use', 'Ya existe una cuenta con ese correo electrónico.');
    }
    throw new Error(error?.message ?? 'Supabase no devolvió el usuario creado.');
  }
  return makeSession(client, data.user);
}

export async function loginContractUser(
  credentials: ContractPasswordCredentials,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<Omit<ContractPasswordSession, 'expiresAt'>> {
  const client = getServiceClient(environment);
  const { data, error } = await client.auth.signInWithPassword({
    email: normalizeEmail(credentials.email),
    password: credentials.password,
  });
  if (error || !data.user) {
    throw new ContractPasswordAuthError('invalid_credentials', 'El correo o la contraseña no son correctos.');
  }
  return makeSession(client, data.user);
}
