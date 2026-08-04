import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
export const CONTRACT_PASSWORD_SESSION_COOKIE = 'contract_password_session';
const STANDARD_SESSION_TTL_SECONDS = 8 * 60 * 60;
const REMEMBERED_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export class ContractPasswordAuthConfigurationError extends Error {
    constructor() {
        super('Supabase password authentication requires SUPABASE_URL, '
            + 'SUPABASE_SERVICE_ROLE_KEY, and a CONTRACT_TOKEN_SECRET of at least 32 characters.');
        this.name = 'ContractPasswordAuthConfigurationError';
    }
}
export class ContractPasswordAuthError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ContractPasswordAuthError';
        this.code = code;
    }
}
function getServiceClient(environment) {
    const url = environment.SUPABASE_URL?.trim();
    const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceRoleKey)
        throw new ContractPasswordAuthConfigurationError();
    return createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
function sessionSecret(environment) {
    const secret = environment.CONTRACT_TOKEN_SECRET?.trim();
    if (!secret || secret.length < 32) {
        throw new ContractPasswordAuthConfigurationError();
    }
    return secret;
}
function encode(value) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}
function decode(value) {
    try {
        return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
}
function sign(value, environment) {
    return createHmac('sha256', sessionSecret(environment))
        .update(value, 'utf8')
        .digest('base64url');
}
function signedValue(value, environment) {
    return `${value}.${sign(value, environment)}`;
}
function verifySignedValue(value, environment) {
    const separator = value.lastIndexOf('.');
    if (separator <= 0)
        return null;
    const payload = value.slice(0, separator);
    const signature = value.slice(separator + 1);
    const expected = Buffer.from(sign(payload, environment));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        return null;
    return payload;
}
function serializeCookie(value, environment, maxAgeSeconds) {
    const attributes = [
        `${CONTRACT_PASSWORD_SESSION_COOKIE}=${encodeURIComponent(value)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
    ];
    if (environment.NODE_ENV === 'production')
        attributes.push('Secure');
    if (maxAgeSeconds !== undefined)
        attributes.push(`Max-Age=${maxAgeSeconds}`);
    return attributes.join('; ');
}
export function clearContractPasswordSessionCookie(environment = process.env) {
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
function cookiesFromRequest(req) {
    const cookies = new Map();
    for (const part of (req.get('Cookie') ?? '').split(';')) {
        const separator = part.indexOf('=');
        if (separator <= 0)
            continue;
        try {
            cookies.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
        }
        catch {
            // Ignore malformed caller-controlled cookie fragments.
        }
    }
    return cookies;
}
export function getContractPasswordSession(req, environment = process.env) {
    const raw = cookiesFromRequest(req).get(CONTRACT_PASSWORD_SESSION_COOKIE);
    if (!raw)
        return null;
    const payload = verifySignedValue(raw, environment);
    if (!payload)
        return null;
    const session = decode(payload);
    if (!session
        || typeof session.userId !== 'string'
        || typeof session.email !== 'string'
        || typeof session.name !== 'string'
        || typeof session.isAdmin !== 'boolean'
        || typeof session.expiresAt !== 'number'
        || !Number.isSafeInteger(session.expiresAt)
        || session.expiresAt <= Math.floor(Date.now() / 1000))
        return null;
    return session;
}
export function serializeContractPasswordSessionCookie(session, environment = process.env, rememberMe = false) {
    const ttlSeconds = rememberMe
        ? REMEMBERED_SESSION_TTL_SECONDS
        : STANDARD_SESSION_TTL_SECONDS;
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    return serializeCookie(signedValue(encode({ ...session, expiresAt }), environment), environment, rememberMe ? ttlSeconds : undefined);
}
function normalizeEmail(value) {
    return value.trim().toLowerCase();
}
function normalizeName(value, email) {
    return typeof value === 'string' && value.trim()
        ? value.trim().slice(0, 256)
        : email;
}
async function isAdminUser(client, userId) {
    const { data, error } = await client
        .from('contract_admin_users')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
    if (error)
        throw new Error(`Supabase admin role lookup failed: ${error.message}`);
    return Boolean(data);
}
async function makeSession(client, user) {
    const email = normalizeEmail(user.email ?? '');
    if (!user.id || !email) {
        throw new ContractPasswordAuthError('invalid_credentials', 'La cuenta no tiene un correo electrónico válido.');
    }
    if (!(await isAdminUser(client, user.id))) {
        throw new ContractPasswordAuthError('not_admin', 'La cuenta no está habilitada para administrar contratos.');
    }
    return {
        userId: user.id,
        email,
        name: normalizeName(user.user_metadata?.full_name, email),
        isAdmin: true,
    };
}
export async function registerContractUser(credentials, environment = process.env) {
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
            throw new ContractPasswordAuthError('email_in_use', 'Ya existe una cuenta con ese correo electrónico.');
        }
        throw new Error(error?.message ?? 'Supabase no devolvió el usuario creado.');
    }
    return makeSession(client, data.user);
}
export async function loginContractUser(credentials, environment = process.env) {
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
//# sourceMappingURL=contractPasswordAuth.js.map