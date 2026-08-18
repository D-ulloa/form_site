import { createHash, timingSafeEqual } from 'node:crypto';
export class ContractAuthenticationError extends Error {
    status = 401;
    constructor(message) {
        super(message);
        this.name = 'ContractAuthenticationError';
    }
}
export class ContractAuthorizationError extends Error {
    status = 403;
    constructor(message) {
        super(message);
        this.name = 'ContractAuthorizationError';
    }
}
function constantTimeMatches(actual, expected) {
    const actualDigest = createHash('sha256').update(actual, 'utf8').digest();
    const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
    return timingSafeEqual(actualDigest, expectedDigest);
}
function authenticateBearer(authorization, environment) {
    const match = /^Bearer[ \t]+([^\s,]+)$/u.exec(authorization.trim());
    if (!match?.[1]) {
        throw new ContractAuthenticationError('Authorization must use a single Bearer token.');
    }
    const expectedKey = environment.CONTRACTS_API_KEY?.trim();
    if (!expectedKey) {
        throw new ContractAuthenticationError('Bearer authentication is not configured on this server.');
    }
    if (!constantTimeMatches(match[1], expectedKey)) {
        throw new ContractAuthorizationError('The supplied Bearer token is not authorized.');
    }
    return { mode: 'api_key' };
}
function parseUserIdentity(value, headerName) {
    const normalized = value.trim();
    if (normalized.length === 0 ||
        normalized.length > 256 ||
        /[\u0000-\u001F\u007F]/u.test(normalized)) {
        throw new ContractAuthenticationError(`${headerName} must contain a valid user identifier.`);
    }
    return normalized;
}
export function authenticateContractRequest(input, environment = process.env) {
    if (input.authenticatedUserId !== undefined) {
        if (environment.CONTRACT_TRUSTED_GATEWAY_ENABLED !== 'true') {
            throw new ContractAuthenticationError('X-Authenticated-User-Id requires the reviewed trusted gateway adapter.');
        }
        return {
            mode: 'gateway',
            userId: parseUserIdentity(input.authenticatedUserId, 'X-Authenticated-User-Id'),
        };
    }
    if (input.authorization !== undefined) {
        return authenticateBearer(input.authorization, environment);
    }
    if (input.passwordSession !== undefined) {
        return {
            mode: 'supabase',
            userId: parseUserIdentity(input.passwordSession.userId, 'Supabase user id'),
            email: parseUserIdentity(input.passwordSession.email, 'Supabase email').toLowerCase(),
            isAdmin: input.passwordSession.isAdmin,
        };
    }
    if (input.developmentUserId !== undefined) {
        const isDevelopment = environment.NODE_ENV === 'development';
        if (!isDevelopment) {
            throw new ContractAuthenticationError('X-User-Id authentication is enabled only in exact local development.');
        }
        return {
            mode: 'development',
            userId: parseUserIdentity(input.developmentUserId, 'X-User-Id'),
        };
    }
    throw new ContractAuthenticationError('Contract authentication is required.');
}
export function authorizeContractUserScope(principal, attributedUserId) {
    if (principal.mode === 'api_key')
        return;
    if (principal.userId !== attributedUserId) {
        throw new ContractAuthorizationError('The authenticated user does not match the contract owner.');
    }
}
/**
 * Rows without createdByUserId predate SPEC-22 and remain available to every
 * authenticated administrator. New rows carry the authenticated database ID.
 * API-key callers are trusted internal clients and intentionally remain
 * unscoped, matching the existing API-key contract boundary.
 */
export function canAccessContractEntry(principal, entry) {
    if (principal.mode === 'api_key')
        return true;
    if (entry.createdByUserId === null || entry.createdByUserId === undefined) {
        return true;
    }
    const ownerId = entry.createdByUserId.trim();
    return ownerId.length > 0 && ownerId === principal.userId;
}
export function authorizeContractEntryAccess(principal, entry) {
    if (canAccessContractEntry(principal, entry))
        return;
    throw new ContractAuthorizationError('The authenticated user does not have access to this contract.');
}
export function getContractPrincipalUserId(principal, attributedUserId) {
    if (principal.mode !== 'api_key')
        return principal.userId;
    const normalized = attributedUserId?.trim();
    if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/u.test(normalized)) {
        throw new ContractAuthenticationError('createdBy is required when using server API-key authentication.');
    }
    return normalized;
}
export function authorizeContractAdmin(principal, environment = process.env) {
    if (principal.mode === 'api_key')
        return;
    if (principal.mode === 'supabase') {
        if (principal.isAdmin)
            return;
        throw new ContractAuthorizationError('Contract administrator access is required.');
    }
    const admins = new Set((environment.CONTRACT_ADMIN_USER_IDS ?? '')
        .split(',').map((value) => value.trim()).filter(Boolean));
    if (!admins.has(principal.userId)) {
        throw new ContractAuthorizationError('Contract administrator access is required.');
    }
}
//# sourceMappingURL=contractAuth.js.map