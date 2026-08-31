import { createHmac, timingSafeEqual } from 'node:crypto';
import { approvedOrigins, IdentityConfigurationError } from '../identity/sessionSecurity.js';

export type InvitationDeliveryOutcome = 'accepted_by_provider' | 'rejected' | 'ambiguous';
export interface InvitationDeliveryMessage {
  readonly attempt_id: string;
  readonly idempotency_key: string;
  readonly recipient: string;
  readonly organization_display_name: string;
  readonly inviter_display_name: string;
  readonly intended_role: 'admin' | 'member' | 'viewer';
  readonly expires_at: string;
  readonly acceptance_url: string;
  readonly locale: string;
  readonly template_version: string;
}
export interface InvitationDeliveryResult {
  readonly outcome: InvitationDeliveryOutcome;
  readonly provider_reference?: string;
  readonly safe_error_code?: string;
}
export interface InvitationDeliveryAdapter { send(message: InvitationDeliveryMessage): Promise<InvitationDeliveryResult> }

function escaped(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function renderInvitationEmail(message: InvitationDeliveryMessage): { subject: string; text: string; html: string } {
  const role = ({ admin: 'administrador', member: 'miembro', viewer: 'lector' } as const)[message.intended_role];
  const subject = `Invitación a ${message.organization_display_name}`.replace(/[\r\n]/gu, ' ').slice(0, 180);
  const lines = [`${message.inviter_display_name} te invitó a ${message.organization_display_name} como ${role}.`,
    `La invitación vence el ${message.expires_at}.`, message.acceptance_url,
    'Si no esperabas esta invitación, ignorá este mensaje. No compartas el enlace.'];
  return { subject, text: lines.join('\n\n'), html: `<p>${escaped(lines[0] ?? '')}</p><p>${escaped(lines[1] ?? '')}</p>`
    + `<p><a href="${escaped(message.acceptance_url)}">Revisar invitación</a></p><p>${escaped(lines[3] ?? '')}</p>` };
}

export class CaptureInvitationDeliveryAdapter implements InvitationDeliveryAdapter {
  readonly messages: InvitationDeliveryMessage[] = [];
  async send(message: InvitationDeliveryMessage): Promise<InvitationDeliveryResult> {
    this.messages.push(message); return { outcome: 'accepted_by_provider', provider_reference: `capture:${message.attempt_id}` };
  }
}

export class DisabledInvitationDeliveryAdapter implements InvitationDeliveryAdapter {
  async send(_message: InvitationDeliveryMessage): Promise<InvitationDeliveryResult> {
    return { outcome: 'rejected', safe_error_code: 'DELIVERY_DISABLED' };
  }
}

export class ResendInvitationDeliveryAdapter implements InvitationDeliveryAdapter {
  constructor(private readonly apiKey: string, private readonly from: string,
    private readonly timeoutMilliseconds: number, private readonly fetcher: typeof fetch = fetch) {}
  async send(message: InvitationDeliveryMessage): Promise<InvitationDeliveryResult> {
    const rendered = renderInvitationEmail(message); const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
    try {
      const response = await this.fetcher('https://api.resend.com/emails', { method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotency_key },
        body: JSON.stringify({ from: this.from, to: [message.recipient], subject: rendered.subject,
          text: rendered.text, html: rendered.html }) });
      if (!response.ok) return { outcome: response.status >= 500 || response.status === 429 ? 'ambiguous' : 'rejected',
        safe_error_code: response.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_REJECTED' };
      const body = await response.text();
      if (Buffer.byteLength(body, 'utf8') > 16_384) return { outcome: 'ambiguous', safe_error_code: 'PROVIDER_RESPONSE_INVALID' };
      const id = (JSON.parse(body) as { id?: unknown }).id;
      if (typeof id !== 'string' || id.length > 256) return { outcome: 'ambiguous', safe_error_code: 'PROVIDER_RESPONSE_INVALID' };
      return { outcome: 'accepted_by_provider', provider_reference: id };
    } catch { return { outcome: 'ambiguous', safe_error_code: 'PROVIDER_TIMEOUT_OR_UNAVAILABLE' }; }
    finally { clearTimeout(timer); }
  }
}

export interface InvitationDeliveryConfiguration {
  readonly enabled: boolean; readonly delivery_method: 'share_link' | 'email';
  readonly adapter: 'disabled' | 'capture' | 'resend'; readonly public_base_url: string;
  readonly template_version: string; readonly provider_reference_pepper: string; readonly webhook_secret: string;
}

export function invitationDeliveryConfiguration(environment: NodeJS.ProcessEnv): InvitationDeliveryConfiguration {
  const enabled = environment.INVITATION_ROUTES_ENABLED === 'true';
  const deliveryMethod = (environment.INVITATION_DELIVERY_METHOD?.trim() || 'share_link') as InvitationDeliveryConfiguration['delivery_method'];
  const adapter = (environment.INVITATION_EMAIL_ADAPTER?.trim() || 'disabled') as InvitationDeliveryConfiguration['adapter'];
  const publicBaseUrl = environment.INVITATION_PUBLIC_BASE_URL?.trim() ?? '';
  const templateVersion = environment.INVITATION_EMAIL_TEMPLATE_VERSION?.trim() ?? '';
  const pepper = environment.INVITATION_PROVIDER_REFERENCE_PEPPER?.trim() ?? '';
  const webhookSecret = environment.RESEND_WEBHOOK_SECRET?.trim() ?? '';
  const webhookKeyLength = webhookSecret.startsWith('whsec_')
    ? Buffer.from(webhookSecret.slice('whsec_'.length), 'base64').length : 0;
  if (!['share_link', 'email'].includes(deliveryMethod)) throw new IdentityConfigurationError('Unknown invitation delivery method.');
  if (!['disabled', 'capture', 'resend'].includes(adapter)) throw new IdentityConfigurationError('Unknown invitation adapter.');
  if (enabled) {
    let url: URL; try { url = new URL(publicBaseUrl); } catch { throw new IdentityConfigurationError('Invitation URL invalid.'); }
    const secureUrl = url.protocol === 'https:' || (environment.NODE_ENV !== 'production'
      && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    if (!secureUrl || !approvedOrigins(environment).has(url.origin)
      || environment.PLATFORM_AUDIT_REQUIRED !== 'true'
      || !environment.INVITATION_ALERT_OWNER?.trim()
      || Buffer.byteLength(environment.PLATFORM_RATE_LIMIT_PEPPER?.trim() ?? '', 'utf8') < 32) {
      throw new IdentityConfigurationError('Invitation production controls incomplete.');
    }
    if (deliveryMethod === 'email') {
      if (!/^v[1-9][0-9]{0,5}$/u.test(templateVersion) || Buffer.byteLength(pepper) < 32) {
        throw new IdentityConfigurationError('Invitation production controls incomplete.');
      }
      if (adapter === 'disabled') throw new IdentityConfigurationError('Invitation delivery adapter is disabled.');
      const timeout = Number(environment.INVITATION_EMAIL_TIMEOUT_MS ?? 5000);
      if (!Number.isSafeInteger(timeout) || timeout < 500 || timeout > 30_000
        || /[\r\n]/u.test(environment.INVITATION_EMAIL_FROM ?? '')) {
        throw new IdentityConfigurationError('Invitation provider controls are invalid.');
      }
      if (environment.NODE_ENV === 'production' && (adapter !== 'resend' || !environment.RESEND_API_KEY?.trim()
        || !environment.INVITATION_EMAIL_FROM?.trim() || webhookKeyLength < 16)) {
        throw new IdentityConfigurationError('Certified invitation delivery is unavailable.');
      }
      if ((environment.VERCEL_ENV === 'preview' || environment.NODE_ENV !== 'production') && adapter === 'resend') {
        throw new IdentityConfigurationError('Real invitation sending is forbidden outside production.');
      }
    }
  }
  return { enabled, delivery_method: deliveryMethod, adapter, public_base_url: publicBaseUrl, template_version: templateVersion,
    provider_reference_pepper: pepper, webhook_secret: webhookSecret };
}

export function createInvitationDeliveryAdapter(environment: NodeJS.ProcessEnv): InvitationDeliveryAdapter {
  const config = invitationDeliveryConfiguration(environment);
  if (config.adapter === 'capture') return new CaptureInvitationDeliveryAdapter();
  if (config.adapter === 'resend') return new ResendInvitationDeliveryAdapter(environment.RESEND_API_KEY ?? '',
    environment.INVITATION_EMAIL_FROM ?? '', Number(environment.INVITATION_EMAIL_TIMEOUT_MS ?? 5000));
  return new DisabledInvitationDeliveryAdapter();
}

export function verifyResendWebhook(payload: Buffer, headers: Readonly<Record<string, string | undefined>>,
  secret: string, nowSeconds = Math.floor(Date.now() / 1000)): { event_id: string; body: unknown } {
  const id = headers['svix-id'] ?? ''; const timestamp = headers['svix-timestamp'] ?? '';
  const signatures = (headers['svix-signature'] ?? '').split(' ').map((part) => part.replace(/^v1,/u, ''));
  const seconds = Number(timestamp); if (!id || !Number.isSafeInteger(seconds) || Math.abs(nowSeconds - seconds) > 300) throw new Error('WEBHOOK_INVALID');
  const key = Buffer.from(secret.replace(/^whsec_/u, ''), 'base64');
  if (!secret.startsWith('whsec_') || key.length < 16) throw new Error('WEBHOOK_INVALID');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${payload.toString('utf8')}`).digest();
  const valid = signatures.some((signature) => { try { const actual = Buffer.from(signature, 'base64');
    return actual.length === expected.length && timingSafeEqual(actual, expected); } catch { return false; } });
  if (!valid) throw new Error('WEBHOOK_INVALID');
  return { event_id: id, body: JSON.parse(payload.toString('utf8')) as unknown };
}
