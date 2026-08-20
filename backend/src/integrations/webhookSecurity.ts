import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { OutboxEnvelope } from './types.js';

export function isForbiddenAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [first = 0, second = 0, third = 0] = address.split('.').map(Number);
    return first === 0 || first === 10 || first === 127 || first >= 224
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && (second === 168 || (second === 0 && (third === 0 || third === 2))))
      || (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100)))
      || (first === 203 && second === 0 && third === 113);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fc')
      || normalized.startsWith('fd') || /^fe[89ab]/u.test(normalized) || normalized.startsWith('ff')
      || normalized.startsWith('2001:db8:') || normalized.startsWith('::ffff:');
  }
  return true;
}

export async function validateWebhookDestination(raw: string,
  resolve: (hostname: string) => Promise<readonly string[]>): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('UNSAFE_DESTINATION'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash
    || (url.port && url.port !== '443') || raw.length > 2048) throw new Error('UNSAFE_DESTINATION');
  const addresses = isIP(url.hostname) ? [url.hostname] : await resolve(url.hostname);
  if (addresses.length === 0 || addresses.some(isForbiddenAddress)) throw new Error('UNSAFE_DESTINATION');
  return url;
}

export function serializeWebhookEnvelope(envelope: OutboxEnvelope): string {
  const body = JSON.stringify(envelope);
  if (Buffer.byteLength(body) > 64 * 1024) throw new Error('PAYLOAD_TOO_LARGE');
  if (!envelope.event_id || !envelope.idempotency_key || envelope.schema_version !== '1') {
    throw new Error('INVALID_EVENT_PAYLOAD');
  }
  return body;
}

export function signWebhook(body: string, timestamp: string, eventId: string, secret: Uint8Array): string {
  return `v1=${createHmac('sha256', secret).update(timestamp).update('.').update(eventId).update('.').update(body).digest('hex')}`;
}

export function verifyWebhookSignature(signature: string, expected: string): boolean {
  const left = Buffer.from(signature); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
