import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { CaptureInvitationDeliveryAdapter, ResendInvitationDeliveryAdapter,
  invitationDeliveryConfiguration, renderInvitationEmail, verifyResendWebhook } from '../../src/organizations/invitationDelivery.js';
import { InvitationWorkflowService, type InvitationWorkflowRepository } from '../../src/organizations/invitationWorkflow.js';

const configuration = { enabled: true, delivery_method: 'email' as const, adapter: 'capture' as const, public_base_url: 'https://app.example.test',
  template_version: 'v1', provider_reference_pepper: 'p'.repeat(48), webhook_secret: 'whsec_c2VjcmV0' };

class FakeRepository implements InvitationWorkflowRepository {
  created: Record<string, unknown> | null = null; completed: Record<string, unknown> | null = null;
  beginDelivery() { return Promise.resolve(); }
  completeDelivery(input: Record<string, unknown>) { this.completed = input; return Promise.resolve(); }
  invalidateHandoffs() { return Promise.resolve(); }
  createHandoff(input: Record<string, unknown>) { this.created = input; return Promise.resolve(); }
  resolveHandoff() { return Promise.resolve(null); }
  acceptHandoff() { throw new Error('not used'); }
  organizationSlug() { return Promise.resolve('solar'); }
  recordWebhook() { return Promise.resolve(true); }
  listMembers() { return Promise.resolve([]); }
  listInvitations() { return Promise.resolve([]); }
  registrationContext() { return Promise.resolve(null); }
  completeRegistration() { return Promise.resolve(); }
}

test('SPEC-37 template escapes customer text and keeps the action in a URL fragment', () => {
  const output = renderInvitationEmail({ attempt_id: 'a', idempotency_key: 'delivery-1', recipient: 'x@example.test',
    organization_display_name: '<Solar>', inviter_display_name: 'Ana & Bob', intended_role: 'member',
    expires_at: '2026-08-26T00:00:00.000Z', acceptance_url: 'https://app.example.test/invitations/accept#invitation_token=opaque',
    locale: 'es', template_version: 'v1' });
  assert.match(output.html, /&lt;Solar&gt;/u); assert.match(output.html, /Ana &amp; Bob/u);
  assert.doesNotMatch(output.subject, /opaque/u); assert.match(output.text, /#invitation_token=opaque/u);
});

test('SPEC-37 provider adapter maps rejection and timeout without leaking provider bodies', async () => {
  const message = { attempt_id: 'a', idempotency_key: 'delivery-1', recipient: 'x@example.test',
    organization_display_name: 'Solar', inviter_display_name: 'Ana', intended_role: 'viewer' as const,
    expires_at: '2026-08-26T00:00:00.000Z', acceptance_url: 'https://app.example.test/invitations/accept#invitation_token=opaque',
    locale: 'es', template_version: 'v1' };
  const rejected = new ResendInvitationDeliveryAdapter('secret', 'Access <access@example.test>', 50,
    async () => new Response('raw provider password=bad', { status: 422 }));
  assert.deepEqual(await rejected.send(message), { outcome: 'rejected', safe_error_code: 'PROVIDER_REJECTED' });
  const unavailable = new ResendInvitationDeliveryAdapter('secret', 'Access <access@example.test>', 50,
    async () => { throw new Error('raw provider secret'); });
  assert.deepEqual(await unavailable.send(message), { outcome: 'ambiguous', safe_error_code: 'PROVIDER_TIMEOUT_OR_UNAVAILABLE' });
});

test('SPEC-37 creates only hashed, browser-bound, short-lived handoff evidence', async () => {
  const repository = new FakeRepository(); const service = new InvitationWorkflowService(repository,
    new CaptureInvitationDeliveryAdapter(), configuration, () => new Date('2026-08-25T00:00:00.000Z'));
  const result = await service.createHandoff('t'.repeat(43), null, 'https://app.example.test');
  assert.equal(result.max_age_seconds, 900); assert.ok(repository.created);
  assert.equal(String(repository.created.raw_invitation_token), 't'.repeat(43));
  assert.match(String(repository.created.handle_hash), /^[0-9a-f]{64}$/u);
  assert.doesNotMatch(JSON.stringify(repository.created), new RegExp(result.handle, 'u'));
});

test('SPEC-37 verifies timestamped webhook signatures and rejects tampering', () => {
  const payload = Buffer.from('{"type":"email.delivered"}'); const timestamp = '1000'; const id = 'evt_1';
  const webhookKey = Buffer.from('s'.repeat(32)); const webhookSecret = `whsec_${webhookKey.toString('base64')}`;
  const signature = createHmac('sha256', webhookKey).update(`${id}.${timestamp}.${payload.toString()}`).digest('base64');
  assert.equal(verifyResendWebhook(payload, { 'svix-id': id, 'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}` }, webhookSecret, 1000).event_id, id);
  assert.throws(() => verifyResendWebhook(Buffer.from('{}'), { 'svix-id': id, 'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}` }, webhookSecret, 1000), /WEBHOOK_INVALID/u);
});

test('SPEC-37 production startup fails closed without the certified provider controls', () => {
  assert.throws(() => invitationDeliveryConfiguration({ INVITATION_ROUTES_ENABLED: 'true',
    INVITATION_DELIVERY_METHOD: 'email', INVITATION_EMAIL_ADAPTER: 'disabled' }), /Invitation/u);
  assert.doesNotThrow(() => invitationDeliveryConfiguration({ NODE_ENV: 'production', INVITATION_ROUTES_ENABLED: 'true',
    INVITATION_DELIVERY_METHOD: 'email', INVITATION_EMAIL_ADAPTER: 'resend', INVITATION_PUBLIC_BASE_URL: 'https://app.example.test',
    INVITATION_EMAIL_TEMPLATE_VERSION: 'v1', INVITATION_PROVIDER_REFERENCE_PEPPER: 'p'.repeat(48),
    INVITATION_ALERT_OWNER: 'operations', PLATFORM_AUDIT_REQUIRED: 'true', PLATFORM_RATE_LIMIT_PEPPER: 'r'.repeat(48),
    APP_ALLOWED_ORIGINS: 'https://app.example.test', RESEND_API_KEY: 're_test', INVITATION_EMAIL_FROM: 'Access <access@example.test>',
    RESEND_WEBHOOK_SECRET: `whsec_${Buffer.from('s'.repeat(32)).toString('base64')}` }));
});

test('SPEC-37 manual links need no email provider and are returned only from the issuance call', () => {
  const config = invitationDeliveryConfiguration({ NODE_ENV: 'production', INVITATION_ROUTES_ENABLED: 'true',
    INVITATION_DELIVERY_METHOD: 'share_link', INVITATION_EMAIL_ADAPTER: 'disabled',
    INVITATION_PUBLIC_BASE_URL: 'https://app.example.test', INVITATION_ALERT_OWNER: 'operations',
    PLATFORM_AUDIT_REQUIRED: 'true', PLATFORM_RATE_LIMIT_PEPPER: 'r'.repeat(48),
    APP_ALLOWED_ORIGINS: 'https://app.example.test' });
  const service = new InvitationWorkflowService(new FakeRepository(), new CaptureInvitationDeliveryAdapter(), config);
  const receipt = service.manualLink({ id: 'invite-1', organization_id: 'organization-1', email_normalized: 'a@example.test',
    intended_role: 'viewer', status: 'pending', expires_at: '2026-08-29T00:00:00.000Z', delivery_state: 'pending',
    delivery_method: 'share_link', token_version: 1, version: 1 }, 't'.repeat(43));
  assert.equal(receipt.delivery_method, 'share_link');
  assert.match(receipt.share_url ?? '', /^https:\/\/app\.example\.test\/invitations\/accept#invitation_token=/u);
});
