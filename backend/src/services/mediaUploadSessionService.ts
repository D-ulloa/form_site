import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface SessionUpload {
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  storage_bucket?: string;
  public_path?: string;
}

interface UploadSessionClaims {
  version: 1;
  agentUserId: string;
  organizationId: string | null;
  expiresAt: number;
  nonce: string;
  uploadsHash: string;
}

const TOKEN_VERSION = 'v1';
const MAX_TOKEN_LENGTH = 2048;

function sessionTtl(environment: NodeJS.ProcessEnv): number {
  const value = Number(environment.MEDIA_UPLOAD_SESSION_TTL_MS ?? '600000');
  return Number.isSafeInteger(value) && value >= 60_000 ? value : 60_000;
}

function signingKey(environment: NodeJS.ProcessEnv): string {
  const key = environment.APP_SESSION_PEPPER?.trim();
  if (!key || Buffer.byteLength(key, 'utf8') < 32) {
    throw new Error('APP_SESSION_PEPPER must contain at least 32 bytes for media upload sessions.');
  }
  return key;
}

function uploadsHash(uploads: readonly SessionUpload[]): string {
  const canonical = uploads.map((upload) => [
    upload.original_name,
    upload.storage_path,
    upload.mime_type,
    upload.size_bytes,
    upload.storage_bucket ?? null,
    upload.public_path ?? null,
  ]);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('base64url');
}

function signature(payload: string, environment: NodeJS.ProcessEnv): Buffer {
  return createHmac('sha256', signingKey(environment))
    .update(`property-media-upload-session.${TOKEN_VERSION}.${payload}`, 'utf8')
    .digest();
}

/** A signed session survives separate Vercel instances and binds the issued paths to the actor. */
export function createUploadSession(
  agentUserId: string,
  organizationId: string | null,
  uploads: readonly SessionUpload[],
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const claims: UploadSessionClaims = {
    version: 1,
    agentUserId,
    organizationId,
    expiresAt: Date.now() + sessionTtl(environment),
    nonce: randomUUID(),
    uploadsHash: uploadsHash(uploads),
  };
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${TOKEN_VERSION}.${payload}.${signature(payload, environment).toString('base64url')}`;
}

export function verifyUploadSession(
  sessionId: string,
  agentUserId: string,
  organizationId: string | null,
  uploads: readonly SessionUpload[],
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  if (sessionId.length > MAX_TOKEN_LENGTH) return false;
  const parts = sessionId.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !parts[1] || !parts[2]) return false;
  const [, payload, encodedSignature] = parts;
  if (!payload || !encodedSignature || !/^[A-Za-z0-9_-]+$/.test(encodedSignature)) return false;

  const expected = signature(payload, environment);
  const actual = Buffer.from(encodedSignature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UploadSessionClaims;
    return claims.version === 1
      && claims.agentUserId === agentUserId
      && claims.organizationId === organizationId
      && Number.isSafeInteger(claims.expiresAt)
      && claims.expiresAt > Date.now()
      && claims.uploadsHash === uploadsHash(uploads);
  } catch {
    return false;
  }
}
