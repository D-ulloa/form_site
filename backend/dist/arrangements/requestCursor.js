import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { PlatformError } from '../platform/errors.js';
const Position = z.object({ id: z.uuid(), at: z.iso.datetime({ offset: true }).nullable() }).strict();
export function createRequestCursorCodec(secret, binding) {
    if (Buffer.byteLength(secret) < 32)
        throw new PlatformError('DEPENDENCY_UNAVAILABLE');
    const scope = JSON.stringify(['arrangements.orders', binding.audience ? 4 : 3, binding.organization_id, binding.property_id, binding.status, binding.limit, binding.ordering ?? 'submitted_at.desc.nullslast,id.desc', ...(binding.audience ? [binding.audience, binding.membership_id ?? null] : []), binding.search ?? null]);
    const sign = (body) => createHmac('sha256', secret).update(body).digest();
    return {
        encode(position) {
            const body = Buffer.from(JSON.stringify({ scope, position })).toString('base64url');
            return `${body}.${sign(body).toString('base64url')}`;
        },
        decode(cursor) {
            try {
                const [body, signature, extra] = cursor.split('.');
                if (!body || !signature || extra !== undefined || cursor.length > 1024)
                    throw new Error();
                const actual = Buffer.from(signature, 'base64url');
                const expected = sign(body);
                if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
                    throw new Error();
                return z.object({ scope: z.literal(scope), position: Position }).strict().parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))).position;
            }
            catch {
                throw new PlatformError('INVALID_CURSOR');
            }
        },
    };
}
//# sourceMappingURL=requestCursor.js.map