import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export const APPLICATION_SESSION_COOKIE = '__Host-form_site_session';
export const DEVELOPMENT_SESSION_COOKIE = 'form_site_session';
export const CSRF_COOKIE = 'form_site_csrf';
export const SESSION_HASH_VERSION = 1;
export class IdentityConfigurationError extends Error {
    constructor(message) { super(message); this.name = 'IdentityConfigurationError'; }
}
function requiredSecret(environment, name) {
    const value = environment[name]?.trim();
    if (!value || Buffer.byteLength(value, 'utf8') < 32) {
        throw new IdentityConfigurationError(`${name} must contain at least 32 bytes.`);
    }
    return value;
}
export function sessionPepper(environment) {
    return requiredSecret(environment, 'APP_SESSION_PEPPER');
}
export function hashSessionSecret(raw, environment) {
    return createHmac('sha256', sessionPepper(environment)).update(raw, 'utf8').digest('hex');
}
export function hashCsrfToken(raw, environment) {
    return createHmac('sha256', requiredSecret(environment, 'APP_CSRF_PEPPER'))
        .update(raw, 'utf8').digest('hex');
}
export function secretMatches(actualRaw, expectedHash, hash) {
    const actual = Buffer.from(hash(actualRaw), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function createSessionTokenMaterial(environment) {
    const rawToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    return {
        raw_token: rawToken,
        token_prefix: rawToken.slice(0, 12),
        token_hash: hashSessionSecret(rawToken, environment),
        csrf_token: csrfToken,
        csrf_token_hash: hashCsrfToken(csrfToken, environment),
        hash_version: SESSION_HASH_VERSION,
    };
}
export function cookieName(environment) {
    return environment.NODE_ENV === 'production' ? APPLICATION_SESSION_COOKIE : DEVELOPMENT_SESSION_COOKIE;
}
export function parseCookies(request) {
    const values = new Map();
    for (const part of (request.get('Cookie') ?? '').split(';')) {
        const at = part.indexOf('=');
        if (at < 1)
            continue;
        try {
            values.set(part.slice(0, at).trim(), decodeURIComponent(part.slice(at + 1).trim()));
        }
        catch { /* deny malformed fragments */ }
    }
    return values;
}
export function sessionTokenFromRequest(request, environment) {
    return parseCookies(request).get(cookieName(environment)) ?? null;
}
export function serializeSessionCookies(material, environment, remembered, maxAgeSeconds) {
    const secure = environment.NODE_ENV === 'production' ? '; Secure' : '';
    const maxAge = remembered ? `; Max-Age=${maxAgeSeconds}` : '';
    return [
        `${cookieName(environment)}=${encodeURIComponent(material.raw_token)}; Path=/; HttpOnly; SameSite=Lax${secure}${maxAge}`,
        `${CSRF_COOKIE}=${encodeURIComponent(material.csrf_token)}; Path=/; SameSite=Strict${secure}${maxAge}`,
    ];
}
export function clearSessionCookies(environment) {
    const secure = environment.NODE_ENV === 'production' ? '; Secure' : '';
    return [cookieName(environment), CSRF_COOKIE].map((name) => `${name}=; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}${name === cookieName(environment) ? '; HttpOnly' : ''}`);
}
export function approvedOrigins(environment) {
    const values = (environment.APP_ALLOWED_ORIGINS ?? environment.CONTRACT_PUBLIC_BASE_URL ?? '')
        .split(',').map((value) => value.trim()).filter(Boolean);
    if (environment.NODE_ENV === 'production' && values.length === 0) {
        throw new IdentityConfigurationError('APP_ALLOWED_ORIGINS is required in production.');
    }
    return new Set(values.map((value) => new URL(value).origin));
}
export function assertMutationOrigin(request, environment) {
    if (environment.NODE_ENV === 'development' && !request.get('Origin'))
        return;
    const origin = request.get('Origin');
    if (!origin || !approvedOrigins(environment).has(origin))
        throw new IdentityAccessError('ORIGIN_DENIED', 403);
}
export function assertCsrf(request, expectedHash, environment) {
    assertMutationOrigin(request, environment);
    const header = request.get('X-CSRF-Token') ?? '';
    const cookie = parseCookies(request).get(CSRF_COOKIE) ?? '';
    if (!header || header !== cookie || !secretMatches(header, expectedHash, (value) => hashCsrfToken(value, environment))) {
        throw new IdentityAccessError('CSRF_DENIED', 403);
    }
}
export class IdentityAccessError extends Error {
    code;
    status;
    constructor(code, status) {
        super(code);
        this.code = code;
        this.status = status;
        this.name = 'IdentityAccessError';
    }
}
export function validateIdentityEnvironment(environment) {
    if (environment.NODE_ENV !== 'production')
        return;
    sessionPepper(environment);
    requiredSecret(environment, 'APP_CSRF_PEPPER');
    requiredSecret(environment, 'APP_API_KEY_PEPPER');
    approvedOrigins(environment);
    const resetRedirect = environment.APP_PASSWORD_RESET_REDIRECT_URL?.trim();
    if (!resetRedirect || !approvedOrigins(environment).has(new URL(resetRedirect).origin)) {
        throw new IdentityConfigurationError('APP_PASSWORD_RESET_REDIRECT_URL must use an allowed production origin.');
    }
    for (const key of ['APP_SESSION_TTL_SECONDS', 'APP_REMEMBERED_SESSION_TTL_SECONDS', 'APP_SESSION_IDLE_TTL_SECONDS']) {
        const value = Number(environment[key]);
        if (!Number.isSafeInteger(value) || value < 60)
            throw new IdentityConfigurationError(`${key} is required in production.`);
    }
    const maximumSessions = Number(environment.APP_MAX_ACTIVE_SESSIONS);
    if (!Number.isSafeInteger(maximumSessions) || maximumSessions < 1 || maximumSessions > 100) {
        throw new IdentityConfigurationError('APP_MAX_ACTIVE_SESSIONS must be between 1 and 100.');
    }
    if (environment.SUPPORT_ACCESS_ENABLED === 'true') {
        throw new IdentityConfigurationError('Support access has not been approved and must remain disabled.');
    }
}
//# sourceMappingURL=sessionSecurity.js.map