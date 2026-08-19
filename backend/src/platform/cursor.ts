import { createHmac, timingSafeEqual } from 'node:crypto';
import { PlatformError } from './errors.js';

export interface CursorPayload {
  readonly created_at: string;
  readonly id: string;
  readonly filter_fingerprint: string;
  readonly version: 1;
}

function signature(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function createCursorCodec(secret: string) {
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('CURSOR_SECRET_TOO_SHORT');
  return {
    encode(payload: Omit<CursorPayload, 'version'>): string {
      const body = Buffer.from(JSON.stringify({ ...payload, version: 1 }), 'utf8').toString('base64url');
      return `${body}.${signature(body, secret).toString('base64url')}`;
    },
    decode(cursor: string, filterFingerprint: string): CursorPayload {
      try {
        const [body, rawSignature, extra] = cursor.split('.');
        if (!body || !rawSignature || extra !== undefined || cursor.length > 1024) throw new Error();
        const actual = Buffer.from(rawSignature, 'base64url');
        const expected = signature(body, secret);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
        const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CursorPayload;
        if (parsed.version !== 1 || parsed.filter_fingerprint !== filterFingerprint
          || !Number.isFinite(Date.parse(parsed.created_at))
          || !/^[0-9a-f-]{36}$/iu.test(parsed.id)) throw new Error();
        return parsed;
      } catch {
        throw new PlatformError('INVALID_CURSOR');
      }
    },
  };
}

export function boundedPageSize(value: unknown, defaultValue = 25, maximum = 100): number {
  if (value === undefined) return defaultValue;
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(parsed) || (parsed as number) < 1 || (parsed as number) > maximum) {
    throw new PlatformError('INVALID_CURSOR');
  }
  return parsed as number;
}
