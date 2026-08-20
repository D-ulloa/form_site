import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { ROLE_CAPABILITIES, hasOrganizationCapability } from '../organizations/roleCapabilities.js';
import { IdentityAccessError, createSessionTokenMaterial, hashSessionSecret, secretMatches, sessionTokenFromRequest, } from './sessionSecurity.js';
const STANDARD_ABSOLUTE_SECONDS = 8 * 60 * 60;
const REMEMBERED_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60;
const IDLE_SECONDS = 30 * 60;
const TOUCH_INTERVAL_SECONDS = 5 * 60;
function positiveSeconds(environment, key, fallback) {
    const raw = environment[key]?.trim();
    if (!raw)
        return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 60)
        throw new Error(`${key} must be an integer of at least 60 seconds.`);
    return value;
}
function activeSessionLimit(environment) {
    const value = Number(environment.APP_MAX_ACTIVE_SESSIONS ?? 10);
    if (!Number.isSafeInteger(value) || value < 1 || value > 100)
        throw new Error('APP_MAX_ACTIVE_SESSIONS must be between 1 and 100.');
    return value;
}
function boundedUserAgent(request) {
    const value = request.get('User-Agent')?.replace(/[\u0000-\u001f\u007f]/gu, '').trim();
    return value ? value.slice(0, 256) : null;
}
function requestId(request) {
    return String(request.res?.locals.request_id ?? request.get('X-Request-Id') ?? `req_${randomBytes(18).toString('base64url')}`);
}
function ipv4Number(value) {
    const parts = value.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
        return null;
    return parts.reduce((total, part) => (total * 256 + part) >>> 0, 0);
}
export function ipMatchesRestriction(ip, restriction) {
    const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    const [network = '', prefixRaw] = restriction.split('/');
    if (prefixRaw === undefined)
        return normalized === network;
    const prefix = Number(prefixRaw);
    const addressValue = ipv4Number(normalized);
    const networkValue = ipv4Number(network);
    if (addressValue === null || networkValue === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32)
        return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (addressValue & mask) === (networkValue & mask);
}
export class SessionService {
    repository;
    environment;
    now;
    constructor(repository, environment = process.env, now = () => new Date()) {
        this.repository = repository;
        this.environment = environment;
        this.now = now;
    }
    async create(identity, remembered, request) {
        const maximum = activeSessionLimit(this.environment);
        const active = (await this.repository.listUserSessions(identity.user_id)).filter((session) => !session.revoked_at && Date.parse(session.absolute_expires_at) > this.now().getTime());
        if (active.length >= maximum)
            throw new IdentityAccessError('SESSION_LIMIT_REACHED', 409);
        const material = createSessionTokenMaterial(this.environment);
        const absoluteSeconds = positiveSeconds(this.environment, remembered ? 'APP_REMEMBERED_SESSION_TTL_SECONDS' : 'APP_SESSION_TTL_SECONDS', remembered ? REMEMBERED_ABSOLUTE_SECONDS : STANDARD_ABSOLUTE_SECONDS);
        const idleSeconds = Math.min(positiveSeconds(this.environment, 'APP_SESSION_IDLE_TTL_SECONDS', IDLE_SECONDS), absoluteSeconds);
        const now = this.now();
        const input = {
            identity, material, remembered,
            absolute_expires_at: new Date(now.getTime() + absoluteSeconds * 1000).toISOString(),
            idle_expires_at: new Date(now.getTime() + idleSeconds * 1000).toISOString(),
            request_id: requestId(request), ip_network: request.ip || null,
            user_agent_summary: boundedUserAgent(request),
            active_session_limit: maximum,
        };
        return { session: await this.repository.createSession(input), material, identity, max_age_seconds: absoluteSeconds };
    }
    async authenticate(request, touch = true) {
        if (request.get('Authorization'))
            throw new IdentityAccessError('AMBIGUOUS_CREDENTIALS', 401);
        const raw = sessionTokenFromRequest(request, this.environment);
        if (!raw || raw.length < 32 || raw.length > 128)
            throw new IdentityAccessError('AUTHENTICATION_REQUIRED', 401);
        const hash = hashSessionSecret(raw, this.environment);
        const session = await this.repository.findSession(raw.slice(0, 12), hash);
        if (!session || !secretMatches(raw, session.token_hash, (value) => hashSessionSecret(value, this.environment))) {
            throw new IdentityAccessError('SESSION_INVALID', 401);
        }
        const now = this.now().getTime();
        if (session.revoked_at || Date.parse(session.absolute_expires_at) <= now
            || (session.idle_expires_at !== null && Date.parse(session.idle_expires_at) <= now)) {
            throw new IdentityAccessError('SESSION_EXPIRED', 401);
        }
        const identity = await this.repository.getUser(session.user_id);
        if (!identity)
            throw new IdentityAccessError('SESSION_INVALID', 401);
        let current = session;
        if (touch && now - Date.parse(session.last_seen_at) >= TOUCH_INTERVAL_SECONDS * 1000) {
            const idleSeconds = positiveSeconds(this.environment, 'APP_SESSION_IDLE_TTL_SECONDS', IDLE_SECONDS);
            const idleExpiry = new Date(Math.min(now + idleSeconds * 1000, Date.parse(session.absolute_expires_at))).toISOString();
            current = await this.repository.touchSession(session, idleExpiry, requestId(request), request.ip || null);
        }
        return { session: current, identity };
    }
    async apiKeyContext(request, organizationId, requiredScope) {
        if (sessionTokenFromRequest(request, this.environment))
            throw new IdentityAccessError('AMBIGUOUS_CREDENTIALS', 401);
        const match = /^Bearer[ \t]+(org_[A-Za-z0-9_-]{8,24})\.([A-Za-z0-9_-]{40,64})$/u.exec(request.get('Authorization')?.trim() ?? '');
        if (!match?.[1] || !match[2])
            throw new IdentityAccessError('AUTHENTICATION_REQUIRED', 401);
        const pepper = this.environment.APP_API_KEY_PEPPER?.trim();
        if (!pepper || Buffer.byteLength(pepper) < 32)
            throw new Error('API key verifier is unavailable.');
        const raw = `${match[1]}.${match[2]}`;
        const hash = createHmac('sha256', pepper).update(raw).digest('hex');
        const key = await this.repository.findApiKey(match[1], hash);
        const actual = Buffer.from(hash, 'hex');
        const expected = Buffer.from(key?.secret_hash ?? '0'.repeat(64), 'hex');
        if (!key || actual.length !== expected.length || !timingSafeEqual(actual, expected)
            || key.status !== 'active' || Date.parse(key.expires_at) <= this.now().getTime()
            || key.organization_id !== organizationId || !key.scopes.includes(requiredScope)) {
            throw new IdentityAccessError('NOT_FOUND', 404);
        }
        if (key.allowed_ip_cidrs.length > 0 && !key.allowed_ip_cidrs.some((value) => ipMatchesRestriction(request.ip ?? '', value))) {
            throw new IdentityAccessError('NOT_FOUND', 404);
        }
        await this.repository.touchApiKey(key, request.ip || null);
        return { principal_type: 'organization_api_key', request_id: requestId(request),
            organization_id: key.organization_id, api_key_id: key.id, scopes: new Set(key.scopes) };
    }
    async memberships(userId) {
        const rows = await this.repository.listMemberships(userId);
        return rows.map(({ membership, organization }) => ({
            organization_id: organization.id, organization_slug: organization.slug,
            organization_display_name: organization.display_name, organization_status: organization.status,
            membership_id: membership.id, membership_status: membership.status, role: membership.role,
            capabilities: [...ROLE_CAPABILITIES[membership.role]].filter((capability) => hasOrganizationCapability(membership.role, membership.status, organization.status, capability)),
        }));
    }
    async context(request, organizationIdOrSlug, capability) {
        const { session, identity } = await this.authenticate(request);
        const resolved = await this.repository.getMembership(identity.id, organizationIdOrSlug);
        if (!resolved || resolved.membership.status !== 'active' || resolved.organization.status === 'deleted') {
            throw new IdentityAccessError('NOT_FOUND', 404);
        }
        const effective = new Set([...ROLE_CAPABILITIES[resolved.membership.role]].filter((item) => hasOrganizationCapability(resolved.membership.role, resolved.membership.status, resolved.organization.status, item)));
        if (capability && !effective.has(capability))
            throw new IdentityAccessError('FORBIDDEN', 403);
        return {
            principal_type: 'member', request_id: requestId(request), session_id: session.id,
            user_id: identity.id, display_name: identity.display_name, assurance_level: session.assurance_level,
            organization: resolved.organization, membership: resolved.membership, capabilities: effective,
        };
    }
    async logout(request) {
        const { session } = await this.authenticate(request, false);
        await this.repository.revokeSession(session, 'logout', requestId(request));
    }
    async rotate(request) {
        const { session } = await this.authenticate(request, false);
        const material = createSessionTokenMaterial(this.environment);
        const maxAge = Math.max(60, Math.floor((Date.parse(session.absolute_expires_at) - this.now().getTime()) / 1000));
        const idleSeconds = Math.min(positiveSeconds(this.environment, 'APP_SESSION_IDLE_TTL_SECONDS', IDLE_SECONDS), maxAge);
        const next = await this.repository.rotateSession(session, material, session.absolute_expires_at, new Date(this.now().getTime() + idleSeconds * 1000).toISOString(), requestId(request));
        return { session: next, material, max_age_seconds: maxAge };
    }
    async revokeOthers(request) {
        const { session } = await this.authenticate(request, false);
        return this.repository.revokeOtherSessions(session, requestId(request));
    }
    async listSessions(request) {
        const { session } = await this.authenticate(request);
        return this.repository.listUserSessions(session.user_id);
    }
    createApiKeyMaterial() {
        const rawSecret = randomBytes(32).toString('base64url');
        const prefix = `org_${rawSecret.slice(0, 12)}`;
        const pepper = this.environment.APP_API_KEY_PEPPER?.trim();
        if (!pepper || Buffer.byteLength(pepper) < 32)
            throw new Error('APP_API_KEY_PEPPER must contain at least 32 bytes.');
        return { raw: `${prefix}.${rawSecret}`, prefix,
            hash: createHmac('sha256', pepper).update(`${prefix}.${rawSecret}`).digest('hex') };
    }
    async issueApiKey(request, organizationId, input) {
        const context = await this.context(request, organizationId, 'integrations.manage');
        if (context.assurance_level !== 'aal2')
            throw new IdentityAccessError('STEP_UP_REQUIRED', 403);
        if (!input.name.trim() || input.name.length > 120 || input.scopes.length < 1 || input.scopes.length > 32
            || !Number.isFinite(Date.parse(input.expires_at)) || Date.parse(input.expires_at) <= this.now().getTime()) {
            throw new IdentityAccessError('INVALID_REQUEST', 422);
        }
        const material = this.createApiKeyMaterial();
        const key = await this.repository.createApiKey({
            id: randomUUID(), organization_id: context.organization.id, name: input.name.trim(),
            key_prefix: material.prefix, secret_hash: material.hash, hash_version: 1,
            scopes: [...new Set(input.scopes)], status: 'active',
            created_by_membership_id: context.membership.id, expires_at: input.expires_at,
            allowed_ip_cidrs: input.allowed_ip_cidrs ?? [],
            request_id: context.request_id,
        });
        return { raw_key: material.raw, key };
    }
}
//# sourceMappingURL=sessionService.js.map