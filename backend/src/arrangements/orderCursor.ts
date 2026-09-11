import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { PlatformError } from '../platform/errors.js';

export interface OrderCursorBinding {
  readonly organization_id: string;
  readonly status: string | null;
  readonly limit: number;
}

export function createOrderCursorCodec(secret: string) {
  if (Buffer.byteLength(secret) < 32) throw new PlatformError('DEPENDENCY_UNAVAILABLE');
  const sign = (body: string) => createHmac('sha256', secret).update(body).digest();
  // Version includes the UUID ascending sort and the provisional availability rule.
  const bindingKey = (binding: OrderCursorBinding) =>
    JSON.stringify(['arrangements.orders', 1, binding.organization_id, binding.status, binding.limit, 'id.asc']);
  return {
    encode(afterId: string, binding: OrderCursorBinding): string {
      const body = Buffer.from(JSON.stringify({ after_id: afterId, binding: bindingKey(binding) })).toString('base64url');
      return `${body}.${sign(body).toString('base64url')}`;
    },
    decode(cursor: string, binding: OrderCursorBinding): string {
      try {
        if (cursor.length > 1024) throw new Error();
        const [body, signature, extra] = cursor.split('.');
        if (!body || !signature || extra !== undefined) throw new Error();
        const actual = Buffer.from(signature, 'base64url');
        const expected = sign(body);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
        const payload = z.object({ after_id: z.uuid(), binding: z.literal(bindingKey(binding)) }).strict()
          .parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')));
        return payload.after_id;
      } catch {
        throw new PlatformError('INVALID_CURSOR');
      }
    },
  };
}
