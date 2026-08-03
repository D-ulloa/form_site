import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { google } from 'googleapis';
import type { Request } from 'express';

export const CONTRACT_OAUTH_STATE_COOKIE = 'contract_google_oauth_state';
export const CONTRACT_OAUTH_SESSION_COOKIE = 'contract_admin_session';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface ContractGoogleOAuthUser {
  readonly subject: string;
  readonly email: string;
  readonly name: string;
}

export interface ContractOAuthSession {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly expiresAt: number;
}

export class ContractGoogleOAuthConfigurationError extends Error {
  constructor() {
    super(
      'Google administrator login requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, '
        + 'and CONTRACT_ADMIN_GOOGLE_EMAILS.',
    );
    this.name = 'ContractGoogleOAuthConfigurationError';
  }
}

export class ContractGoogleOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractGoogleOAuthError';
  }
}

function requiredOAuthValues(environment: NodeJS.ProcessEnv): {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly adminEmails: ReadonlySet<string>;
} {
  const clientId = environment.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = environment.GOOGLE_CLIENT_SECRET?.trim();
  const adminEmails = new Set(
    (environment.CONTRACT_ADMIN_GOOGLE_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!clientId || !clientSecret || adminEmails.size === 0) {
    throw new ContractGoogleOAuthConfigurationError();
  }
  return { clientId, clientSecret, adminEmails };
}

function tokenSecret(environment: NodeJS.ProcessEnv): string {
  const secret = environment.CONTRACT_TOKEN_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new ContractGoogleOAuthConfigurationError();
  }
  return secret;
}

function redirectUri(environment: NodeJS.ProcessEnv): string {
  const configured = environment.CONTRACT_GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  const publicBase = environment.CONTRACT_PUBLIC_BASE_URL?.trim();
  if (!publicBase) throw new ContractGoogleOAuthConfigurationError();
  return new URL('/api/auth/google/callback', `${publicBase}/`).toString();
}

function createOAuthClient(environment: NodeJS.ProcessEnv) {
  const { clientId, clientSecret } = requiredOAuthValues(environment);
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri(environment));
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
  return createHmac('sha256', tokenSecret(environment)).update(value, 'utf8').digest('base64url');
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
  name: string,
  value: string,
  options: { readonly maxAge?: number; readonly expires?: Date; readonly clear?: boolean; readonly secure?: boolean } = {},
): string {
  const attributes = [
    `${name}=${options.clear ? '' : value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.maxAge !== undefined) attributes.push(`Max-Age=${options.maxAge}`);
  if (options.expires) attributes.push(`Expires=${options.expires.toUTCString()}`);
  if (options.secure) attributes.push('Secure');
  return attributes.join('; ');
}

export function createContractOAuthState(environment: NodeJS.ProcessEnv = process.env): string {
  const payload = encode({
    nonce: randomBytes(32).toString('base64url'),
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
  });
  return signedValue(payload, environment);
}

export function serializeContractOAuthStateCookie(
  state: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return serializeCookie(CONTRACT_OAUTH_STATE_COOKIE, state, {
    maxAge: 600,
    secure: environment.NODE_ENV === 'production',
  });
}

export function isValidContractOAuthState(
  state: string | undefined,
  cookieState: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!state || !cookieState || state !== cookieState) return false;
  const payload = verifySignedValue(state, environment);
  if (!payload) return false;
  const parsed = decode<{ expiresAt?: number }>(payload);
  return typeof parsed?.expiresAt === 'number' && parsed.expiresAt > Date.now();
}

export function getContractGoogleAuthorizationUrl(
  state: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const client = createOAuthClient(environment);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account',
    scope: ['openid', 'email', 'profile'],
    state,
  });
}

export async function exchangeContractGoogleCode(
  code: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ContractGoogleOAuthUser> {
  const values = requiredOAuthValues(environment);
  const client = createOAuthClient(environment);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const response = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
  const subject = response.data.id?.trim();
  const email = response.data.email?.trim().toLowerCase();
  if (!subject || !email || !values.adminEmails.has(email)) {
    throw new ContractGoogleOAuthError('La cuenta de Google no está habilitada para administrar contratos.');
  }
  return {
    subject,
    email,
    name: response.data.name?.trim() || email,
  };
}

export function serializeContractOAuthSessionCookie(
  user: ContractGoogleOAuthUser,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + OAUTH_SESSION_TTL_SECONDS;
  const payload = encode({ userId: user.subject, email: user.email, name: user.name, expiresAt });
  return serializeCookie(
    CONTRACT_OAUTH_SESSION_COOKIE,
    signedValue(payload, environment),
    { maxAge: OAUTH_SESSION_TTL_SECONDS, secure: environment.NODE_ENV === 'production' },
  );
}

export function clearContractOAuthCookies(environment: NodeJS.ProcessEnv = process.env): string[] {
  const expired = new Date(0);
  return [
    serializeCookie(CONTRACT_OAUTH_STATE_COOKIE, '', {
      maxAge: 0, expires: expired, clear: true, secure: environment.NODE_ENV === 'production',
    }),
    serializeCookie(CONTRACT_OAUTH_SESSION_COOKIE, '', {
      maxAge: 0, expires: expired, clear: true, secure: environment.NODE_ENV === 'production',
    }),
  ];
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

export function getContractGoogleOAuthSession(
  req: Request,
  environment: NodeJS.ProcessEnv = process.env,
): ContractOAuthSession | null {
  const raw = cookiesFromRequest(req).get(CONTRACT_OAUTH_SESSION_COOKIE);
  if (!raw) return null;
  const payload = verifySignedValue(raw, environment);
  if (!payload) return null;
  const session = decode<ContractOAuthSession>(payload);
  if (
    !session ||
    typeof session.userId !== 'string' ||
    typeof session.email !== 'string' ||
    typeof session.name !== 'string' ||
    typeof session.expiresAt !== 'number' ||
    session.expiresAt <= Math.floor(Date.now() / 1000)
  ) return null;
  return session;
}

export function getContractOAuthStateCookie(req: Request): string | undefined {
  return cookiesFromRequest(req).get(CONTRACT_OAUTH_STATE_COOKIE);
}

export function contractOAuthFrontendRedirect(environment: NodeJS.ProcessEnv = process.env): string {
  return environment.CONTRACT_PUBLIC_BASE_URL?.trim() || '/';
}
