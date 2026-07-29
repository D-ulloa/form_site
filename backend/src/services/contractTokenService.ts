import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;
const HASH_PREFIX = 'v1:';

export class ContractTokenConfigurationError extends Error {
  constructor() {
    super('CONTRACT_TOKEN_SECRET must contain at least 32 characters.');
    this.name = 'ContractTokenConfigurationError';
  }
}

function getTokenSecret(environment: NodeJS.ProcessEnv): string {
  const secret = environment.CONTRACT_TOKEN_SECRET?.trim();
  if (!secret || secret.length < 32) throw new ContractTokenConfigurationError();
  return secret;
}

export function generateContractAccessToken(
  generateBytes: (size: number) => Buffer = randomBytes,
): string {
  return generateBytes(TOKEN_BYTES).toString('base64url');
}

export function hashContractAccessToken(
  token: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const digest = createHmac('sha256', getTokenSecret(environment))
    .update(token, 'utf8')
    .digest('hex');
  return `${HASH_PREFIX}${digest}`;
}

export function verifyContractAccessToken(
  token: string,
  storedHash: string,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!storedHash.startsWith(HASH_PREFIX) || token.length < 32 || token.length > 256) {
    return false;
  }
  const expected = Buffer.from(storedHash.slice(HASH_PREFIX.length), 'hex');
  const actual = Buffer.from(
    hashContractAccessToken(token, environment).slice(HASH_PREFIX.length),
    'hex',
  );
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
