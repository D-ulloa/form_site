import { createHash, timingSafeEqual } from 'node:crypto';

export type ContractPrincipal =
  | { readonly mode: 'api_key' }
  | {
      readonly mode: 'gateway' | 'development' | 'insecure_agent';
      readonly userId: string;
    }
  | {
      readonly mode: 'oauth';
      readonly userId: string;
      readonly email: string;
    };

export interface ContractAuthenticationInput {
  readonly authorization: string | undefined;
  readonly authenticatedUserId: string | undefined;
  readonly developmentUserId: string | undefined;
  readonly oauthUser?: { readonly userId: string; readonly email: string };
}

export class ContractAuthenticationError extends Error {
  readonly status = 401;

  constructor(message: string) {
    super(message);
    this.name = 'ContractAuthenticationError';
  }
}

export class ContractAuthorizationError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = 'ContractAuthorizationError';
  }
}

function constantTimeMatches(actual: string, expected: string): boolean {
  const actualDigest = createHash('sha256').update(actual, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function authenticateBearer(
  authorization: string,
  environment: NodeJS.ProcessEnv,
): ContractPrincipal {
  const match = /^Bearer[ \t]+([^\s,]+)$/u.exec(authorization.trim());
  if (!match?.[1]) {
    throw new ContractAuthenticationError(
      'Authorization must use a single Bearer token.',
    );
  }

  const expectedKey = environment.CONTRACTS_API_KEY?.trim();
  if (!expectedKey) {
    throw new ContractAuthenticationError(
      'Bearer authentication is not configured on this server.',
    );
  }

  if (!constantTimeMatches(match[1], expectedKey)) {
    throw new ContractAuthorizationError('The supplied Bearer token is not authorized.');
  }

  return { mode: 'api_key' };
}

function parseUserIdentity(value: string, headerName: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 256 ||
    /[\u0000-\u001F\u007F]/u.test(normalized)
  ) {
    throw new ContractAuthenticationError(
      `${headerName} must contain a valid user identifier.`,
    );
  }
  return normalized;
}

export function authenticateContractRequest(
  input: ContractAuthenticationInput,
  environment: NodeJS.ProcessEnv = process.env,
): ContractPrincipal {
  if (input.authenticatedUserId !== undefined) {
    return {
      mode: 'gateway',
      userId: parseUserIdentity(
        input.authenticatedUserId,
        'X-Authenticated-User-Id',
      ),
    };
  }

  if (input.authorization !== undefined) {
    return authenticateBearer(input.authorization, environment);
  }

  if (input.oauthUser !== undefined) {
    return {
      mode: 'oauth',
      userId: parseUserIdentity(input.oauthUser.userId, 'Google user id'),
      email: parseUserIdentity(input.oauthUser.email, 'Google email').toLowerCase(),
    };
  }

  if (input.developmentUserId !== undefined) {
    const isDevelopment = environment.NODE_ENV === 'development';
    const allowInsecureAgentId =
      environment.CONTRACT_ALLOW_INSECURE_AGENT_ID === 'true';
    if (!isDevelopment && !allowInsecureAgentId) {
      throw new ContractAuthenticationError(
        'X-User-Id authentication is enabled only in development unless '
          + 'CONTRACT_ALLOW_INSECURE_AGENT_ID=true.',
      );
    }
    return {
      mode: isDevelopment ? 'development' : 'insecure_agent',
      userId: parseUserIdentity(input.developmentUserId, 'X-User-Id'),
    };
  }

  throw new ContractAuthenticationError(
    'Contract authentication is required.',
  );
}

export function authorizeContractUserScope(
  principal: ContractPrincipal,
  attributedUserId: string,
): void {
  if (principal.mode === 'api_key') return;

  if (principal.userId !== attributedUserId) {
    throw new ContractAuthorizationError(
      'The authenticated user does not match the contract owner.',
    );
  }
}

export function getContractPrincipalUserId(
  principal: ContractPrincipal,
  attributedUserId?: string,
): string {
  if (principal.mode !== 'api_key') return principal.userId;

  const normalized = attributedUserId?.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/u.test(normalized)) {
    throw new ContractAuthenticationError(
      'createdBy is required when using server API-key authentication.',
    );
  }
  return normalized;
}

export function authorizeContractAdmin(
  principal: ContractPrincipal,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (principal.mode === 'api_key') return;
  const admins = new Set((environment.CONTRACT_ADMIN_USER_IDS ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean));
  if (principal.mode === 'oauth') {
    const googleAdmins = new Set((environment.CONTRACT_ADMIN_GOOGLE_EMAILS ?? '')
      .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
    if (googleAdmins.has(principal.email) || admins.has(principal.userId)) return;
  }
  if (!admins.has(principal.userId)) {
    throw new ContractAuthorizationError('Contract administrator access is required.');
  }
}
