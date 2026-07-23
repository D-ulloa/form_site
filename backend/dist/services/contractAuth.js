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
        return {
            mode: 'gateway',
            userId: parseUserIdentity(input.authenticatedUserId, 'X-Authenticated-User-Id'),
        };
    }
    if (input.authorization !== undefined) {
        return authenticateBearer(input.authorization, environment);
    }
    if (input.developmentUserId !== undefined) {
        if (environment.NODE_ENV !== 'development') {
            throw new ContractAuthenticationError('X-User-Id authentication is enabled only in development.');
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
//# sourceMappingURL=contractAuth.js.map