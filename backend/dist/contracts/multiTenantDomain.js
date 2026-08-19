import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PlatformError } from '../platform/errors.js';
export function requireContractCapability(context, capability) {
    if (!context.capabilities.has(capability))
        throw new PlatformError('FORBIDDEN');
}
export function canSeeContract(context, entry) {
    if (entry.organization_id !== context.scope.organization_id)
        return false;
    if (context.record_visibility === 'organization' || context.role === 'owner' || context.role === 'admin') {
        return true;
    }
    return entry.assigned_to_user_id === context.user_id;
}
export function assertExpectedVersion(actual, expected) {
    if (!Number.isSafeInteger(expected) || expected < 1 || actual !== expected) {
        throw new PlatformError('VERSION_CONFLICT');
    }
}
const STATUS_TRANSITIONS = Object.freeze({
    open: new Set(['complete', 'archived']),
    complete: new Set(['generar_contrato', 'archived']),
    generar_contrato: new Set(['archived']),
    archived: new Set(),
});
export function assertContractStatusTransition(current, next) {
    if (current === next)
        return;
    if (!STATUS_TRANSITIONS[current].has(next))
        throw new PlatformError('VERSION_CONFLICT');
}
function hashLinkToken(rawToken, pepper) {
    return createHash('sha256').update(pepper).update('\0').update(rawToken).digest();
}
export function createContractLinkToken(pepper) {
    if (Buffer.byteLength(pepper) < 32)
        throw new Error('CONTRACT_LINK_PEPPER_TOO_SHORT');
    const raw_token = randomBytes(32).toString('base64url');
    const digest = hashLinkToken(raw_token, pepper);
    return {
        raw_token,
        token_hash: digest.toString('hex'),
        token_prefix: raw_token.slice(0, 8),
        fingerprint: digest.toString('hex').slice(0, 16),
    };
}
export function contractLinkTokenMatches(rawToken, expectedHash, pepper) {
    if (!/^[0-9a-f]{64}$/u.test(expectedHash))
        return false;
    const actual = hashLinkToken(rawToken, pepper);
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function assertActiveLink(link, role, operation, now = new Date()) {
    if (link.status !== 'active' || link.role !== role || !link.allowed_operations.includes(operation)) {
        throw new PlatformError('NOT_FOUND');
    }
    const expiry = Date.parse(link.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now.getTime())
        throw new PlatformError('NOT_FOUND');
}
const BRAND_COLOR = /^#[0-9A-F]{6}$/u;
export const PLATFORM_CONTRACT_BRANDING = Object.freeze({
    display_name: 'Portal de contratos',
    primary_color: '#1F2937',
    accent_color: '#2563EB',
    logo_asset_id: null,
});
export function projectPublicContractBranding(settings) {
    if (!settings)
        return PLATFORM_CONTRACT_BRANDING;
    const displayName = settings.public_display_name?.trim();
    return Object.freeze({
        display_name: displayName && displayName.length <= 160
            ? displayName.replace(/[\u0000-\u001F\u007F<>]/gu, '')
            : PLATFORM_CONTRACT_BRANDING.display_name,
        primary_color: settings.primary_color && BRAND_COLOR.test(settings.primary_color)
            ? settings.primary_color : PLATFORM_CONTRACT_BRANDING.primary_color,
        accent_color: settings.accent_color && BRAND_COLOR.test(settings.accent_color)
            ? settings.accent_color : PLATFORM_CONTRACT_BRANDING.accent_color,
        logo_asset_id: settings.logo_asset_id && /^[0-9a-f-]{36}$/iu.test(settings.logo_asset_id)
            ? settings.logo_asset_id : null,
    });
}
const ALLOWED_TEMPLATE_KEYS = new Set(['schema_id', 'contract_type', 'roles', 'sections', 'computed_fields', 'generation']);
const FORBIDDEN_TEMPLATE_KEY = /(?:html|css|javascript|script|sql|expression|webhook|secret)/iu;
export function validateContractTemplateDefinition(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('INVALID_TEMPLATE');
    const definition = value;
    if (Buffer.byteLength(JSON.stringify(definition)) > 256 * 1024)
        throw new Error('TEMPLATE_TOO_LARGE');
    for (const key of Object.keys(definition)) {
        if (!ALLOWED_TEMPLATE_KEYS.has(key) || FORBIDDEN_TEMPLATE_KEY.test(key))
            throw new Error('UNSAFE_TEMPLATE');
    }
    if (typeof definition.schema_id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/u.test(definition.schema_id)) {
        throw new Error('INVALID_TEMPLATE_SCHEMA_ID');
    }
    if (!definition.roles || typeof definition.roles !== 'object' || Array.isArray(definition.roles)) {
        throw new Error('INVALID_TEMPLATE_ROLES');
    }
    const roles = definition.roles;
    if (!roles.user || !roles.client || Object.keys(roles).some((role) => role !== 'user' && role !== 'client')) {
        throw new Error('INVALID_TEMPLATE_ROLES');
    }
    return Object.freeze(structuredClone(definition));
}
//# sourceMappingURL=multiTenantDomain.js.map