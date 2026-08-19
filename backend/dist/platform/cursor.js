import { createHmac, timingSafeEqual } from 'node:crypto';
import { PlatformError } from './errors.js';
function signature(body, secret) {
    return createHmac('sha256', secret).update(body).digest();
}
export function createCursorCodec(secret) {
    if (Buffer.byteLength(secret, 'utf8') < 32)
        throw new Error('CURSOR_SECRET_TOO_SHORT');
    return {
        encode(payload) {
            const body = Buffer.from(JSON.stringify({ ...payload, version: 1 }), 'utf8').toString('base64url');
            return `${body}.${signature(body, secret).toString('base64url')}`;
        },
        decode(cursor, filterFingerprint) {
            try {
                const [body, rawSignature, extra] = cursor.split('.');
                if (!body || !rawSignature || extra !== undefined || cursor.length > 1024)
                    throw new Error();
                const actual = Buffer.from(rawSignature, 'base64url');
                const expected = signature(body, secret);
                if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
                    throw new Error();
                const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
                if (parsed.version !== 1 || parsed.filter_fingerprint !== filterFingerprint
                    || !Number.isFinite(Date.parse(parsed.created_at))
                    || !/^[0-9a-f-]{36}$/iu.test(parsed.id))
                    throw new Error();
                return parsed;
            }
            catch {
                throw new PlatformError('INVALID_CURSOR');
            }
        },
    };
}
export function boundedPageSize(value, defaultValue = 25, maximum = 100) {
    if (value === undefined)
        return defaultValue;
    const parsed = typeof value === 'string' ? Number(value) : value;
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
        throw new PlatformError('INVALID_CURSOR');
    }
    return parsed;
}
//# sourceMappingURL=cursor.js.map