import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import type { IdentityRepository, SessionCreateInput } from '../../src/identity/identityRepository.js';
import { SessionService, ipMatchesRestriction } from '../../src/identity/sessionService.js';
import {
  IdentityAccessError, assertCsrf, createSessionTokenMaterial, hashSessionSecret,
  serializeSessionCookies,
} from '../../src/identity/sessionSecurity.js';
import type { AppSessionRecord, OrganizationApiKeyRecord } from '../../src/identity/types.js';
import { createIdentityRouter, createOrganizationContextRouter } from '../../src/routes/identity.js';
import { requestIdMiddleware } from '../../src/platform/requestId.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const AZAR_ID = '20000000-0000-4000-8000-000000000001';
const SOLAR_ID = '20000000-0000-4000-8000-000000000002';
const MEMBERSHIP_ID = '30000000-0000-4000-8000-000000000001';
const environment = {
  NODE_ENV: 'test', APP_SESSION_PEPPER: 's'.repeat(48), APP_CSRF_PEPPER: 'c'.repeat(48),
  APP_API_KEY_PEPPER: 'k'.repeat(48), APP_ALLOWED_ORIGINS: 'https://app.example.test',
  APP_PASSWORD_RESET_REDIRECT_URL: 'https://app.example.test/auth/reset',
} as NodeJS.ProcessEnv;

class FakeIdentityRepository implements IdentityRepository {
  readonly sessions = new Map<string, AppSessionRecord>();
  readonly apiKeys: OrganizationApiKeyRecord[] = [];
  async createSession(input: SessionCreateInput): Promise<AppSessionRecord> {
    const row: AppSessionRecord = { id: `40000000-0000-4000-8000-${String(this.sessions.size + 1).padStart(12, '0')}`,
      user_id: input.identity.user_id, token_prefix: input.material.token_prefix,
      token_hash: input.material.token_hash, hash_version: input.material.hash_version,
      csrf_token_hash: input.material.csrf_token_hash, auth_method: input.identity.auth_method,
      assurance_level: input.identity.assurance_level, created_at: new Date().toISOString(),
      authenticated_at: new Date().toISOString(), absolute_expires_at: input.absolute_expires_at,
      idle_expires_at: input.idle_expires_at, remembered: input.remembered,
      last_seen_at: new Date().toISOString(), revoked_at: null, rotated_from_session_id: null, version: 1 };
    this.sessions.set(row.id, row); return row;
  }
  async findSession(prefix: string, hash: string) { return [...this.sessions.values()].find((row) => row.token_prefix === prefix && row.token_hash === hash) ?? null; }
  async touchSession(session: AppSessionRecord, idle: string) { const row = { ...session, idle_expires_at: idle, last_seen_at: new Date().toISOString(), version: session.version + 1 }; this.sessions.set(row.id, row); return row; }
  async rotateSession(session: AppSessionRecord, material: ReturnType<typeof createSessionTokenMaterial>, absolute: string, idle: string) {
    this.sessions.set(session.id, { ...session, revoked_at: new Date().toISOString(), version: session.version + 1 });
    return this.createSession({ identity: { user_id: session.user_id, email: 'owner@example.test', display_name: 'Owner', auth_method: session.auth_method, assurance_level: session.assurance_level },
      material, remembered: session.remembered, absolute_expires_at: absolute, idle_expires_at: idle,
      request_id: 'req_rotation_test', ip_network: null, user_agent_summary: null, active_session_limit: 10 });
  }
  async revokeSession(session: AppSessionRecord) { this.sessions.set(session.id, { ...session, revoked_at: new Date().toISOString(), version: session.version + 1 }); }
  async revokeOtherSessions(session: AppSessionRecord) { let count = 0; for (const row of this.sessions.values()) if (row.user_id === session.user_id && row.id !== session.id && !row.revoked_at) { this.sessions.set(row.id, { ...row, revoked_at: new Date().toISOString() }); count += 1; } return count; }
  async listUserSessions(userId: string) { return [...this.sessions.values()].filter((row) => row.user_id === userId); }
  async getUser(userId: string) { return userId === USER_ID ? { id: USER_ID, email: 'owner@example.test', display_name: 'Owner' } : null; }
  async listMemberships(userId: string) {
    if (userId !== USER_ID) return [];
    return [{ membership: { id: MEMBERSHIP_ID, organization_id: AZAR_ID, user_id: USER_ID,
      role: 'owner' as const, status: 'active' as const, joined_at: new Date().toISOString(), version: 1 },
    organization: { id: AZAR_ID, slug: 'azar', display_name: 'Azar', legal_name: null,
      status: 'active' as const, plan_key: 'internal', locale: 'es-VE', time_zone: 'America/Caracas',
      creation_source: 'migration' as const, created_by_user_id: USER_ID, status_reason_code: null,
      status_changed_at: new Date().toISOString(), created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), deleted_at: null, version: 1 } }];
  }
  async getMembership(userId: string, idOrSlug: string) { return (await this.listMemberships(userId)).find(({ organization }) => organization.id === idOrSlug || organization.slug === idOrSlug) ?? null; }
  async createApiKey(input: Omit<OrganizationApiKeyRecord, 'created_at' | 'last_used_at' | 'version'>) { const row = { ...input, created_at: new Date().toISOString(), last_used_at: null, version: 1 }; this.apiKeys.push(row); return row; }
  async findApiKey(prefix: string, hash: string) { return this.apiKeys.find((row) => row.key_prefix === prefix && row.secret_hash === hash) ?? null; }
  async touchApiKey() { return; }
  async listApiKeys(organizationId: string) { return this.apiKeys.filter((row) => row.organization_id === organizationId); }
  async revokeApiKey() { return; }
}

function cookieMap(values: readonly string[]): Map<string, string> {
  return new Map(values.map((value) => { const [pair = ''] = value.split(';'); const at = pair.indexOf('='); return [pair.slice(0, at), pair.slice(at + 1)]; }));
}

test('SPEC-27 tokens contain 256 bits, persist only keyed hashes, and use secure production cookies', () => {
  const material = createSessionTokenMaterial(environment);
  assert.equal(Buffer.from(material.raw_token, 'base64url').length, 32);
  assert.equal(material.token_hash, hashSessionSecret(material.raw_token, environment));
  assert.doesNotMatch(material.raw_token, new RegExp(USER_ID, 'u'));
  const cookies = serializeSessionCookies(material, { ...environment, NODE_ENV: 'production' }, true, 3600);
  assert.match(cookies[0] ?? '', /^__Host-form_site_session=.*; Path=\/; HttpOnly; SameSite=Lax; Secure; Max-Age=3600$/u);
  assert.match(cookies[1] ?? '', /^form_site_csrf=.*; Path=\/; SameSite=Strict; Secure/u);
});

test('SPEC-27 API-key IP restrictions match bounded IPv4 CIDRs without string-prefix mistakes', () => {
  assert.equal(ipMatchesRestriction('192.0.2.44', '192.0.2.0/24'), true);
  assert.equal(ipMatchesRestriction('192.0.20.44', '192.0.2.0/24'), false);
  assert.equal(ipMatchesRestriction('::ffff:192.0.2.44', '192.0.2.0/24'), true);
});

test('SPEC-27 CSRF requires exact header, cookie, hash, and approved Origin', () => {
  const material = createSessionTokenMaterial(environment);
  const good = { get(name: string) { return ({ Origin: 'https://app.example.test', Cookie: `form_site_csrf=${material.csrf_token}`, 'X-CSRF-Token': material.csrf_token } as Record<string, string>)[name]; } } as never;
  assert.doesNotThrow(() => assertCsrf(good, material.csrf_token_hash, environment));
  const bad = { get(name: string) { return ({ Origin: 'https://solar.example.test', Cookie: `form_site_csrf=${material.csrf_token}`, 'X-CSRF-Token': material.csrf_token } as Record<string, string>)[name]; } } as never;
  assert.throws(() => assertCsrf(bad, material.csrf_token_hash, environment), IdentityAccessError);
});

test('SPEC-27 context revalidates membership and denies cross-organization slugs generically', async () => {
  const repository = new FakeIdentityRepository();
  const service = new SessionService(repository, environment);
  const fakeRequest = { ip: '127.0.0.1', get(name: string) { return name === 'User-Agent' ? 'test' : undefined; }, res: { locals: { request_id: 'req_context_test' } } } as never;
  const created = await service.create({ user_id: USER_ID, email: 'owner@example.test', display_name: 'Owner', auth_method: 'password', assurance_level: 'aal1' }, false, fakeRequest);
  const cookies = cookieMap(serializeSessionCookies(created.material, environment, false, 3600));
  const authenticatedRequest = { ip: '127.0.0.1', get(name: string) { return name === 'Cookie' ? `form_site_session=${cookies.get('form_site_session')}` : undefined; }, res: { locals: { request_id: 'req_context_test' } } } as never;
  const context = await service.context(authenticatedRequest, 'azar', 'contracts.read');
  assert.equal(context.organization.id, AZAR_ID);
  await assert.rejects(service.context(authenticatedRequest, SOLAR_ID), (error: unknown) => error instanceof IdentityAccessError && error.code === 'NOT_FOUND');
});

test('SPEC-27 organization API keys remain a separate tenant and scope-bound principal', async () => {
  const repository = new FakeIdentityRepository(); const service = new SessionService(repository, environment);
  const material = service.createApiKeyMaterial();
  await repository.createApiKey({ id: '50000000-0000-4000-8000-000000000001', organization_id: AZAR_ID,
    name: 'Worker', key_prefix: material.prefix, secret_hash: material.hash, hash_version: 1,
    scopes: ['contracts.read'], status: 'active', created_by_membership_id: MEMBERSHIP_ID,
    expires_at: new Date(Date.now() + 60_000).toISOString(), allowed_ip_cidrs: ['127.0.0.0/8'],
    request_id: 'req_api_key_test' });
  const apiRequest = { ip: '127.0.0.1', get(name: string) { return name === 'Authorization' ? `Bearer ${material.raw}` : undefined; },
    res: { locals: { request_id: 'req_api_key_test' } } } as never;
  assert.equal((await service.apiKeyContext(apiRequest, AZAR_ID, 'contracts.read')).principal_type, 'organization_api_key');
  await assert.rejects(service.apiKeyContext(apiRequest, SOLAR_ID, 'contracts.read'),
    (error: unknown) => error instanceof IdentityAccessError && error.code === 'NOT_FOUND');
});

test('SPEC-27 HTTP bootstrap returns memberships and logout rejects missing CSRF', async () => {
  const repository = new FakeIdentityRepository();
  const service = new SessionService(repository, environment);
  const app = express(); app.use(requestIdMiddleware); app.use(express.json());
  app.use('/api/auth', createIdentityRouter(service, {
    async password() { return { user_id: USER_ID, email: 'owner@example.test', display_name: 'Owner', auth_method: 'password', assurance_level: 'aal1' }; },
    async accessToken() { throw new Error('INVALID_CREDENTIALS'); },
    async requestPasswordReset() { return; }, async updatePassword() { return; }, async updateEmail() { return; },
  }, environment));
  app.use('/api', createOrganizationContextRouter(service, repository, environment));
  const login = await request(app).post('/api/auth/login').set('Origin', 'https://app.example.test')
    .send({ email: 'owner@example.test', password: 'correct-password' }).expect(200);
  assert.equal(login.body.memberships[0].organization_slug, 'azar');
  await request(app).post('/api/auth/register').set('Origin', 'https://app.example.test').send({}).expect(403);
  await request(app).post('/api/auth/password/reset/request').set('Origin', 'https://app.example.test')
    .send({ email: 'owner@example.test' }).expect(202, { accepted: true });
  const setCookies = login.headers['set-cookie'] as unknown as string[];
  const cookieHeader = setCookies.map((value) => value.split(';')[0]).join('; ');
  await request(app).get('/api/organizations/solar/context').set('Cookie', cookieHeader).expect(404);
  await request(app).post('/api/auth/logout').set('Origin', 'https://app.example.test').set('Cookie', cookieHeader).expect(403);
  const csrf = cookieMap(setCookies).get('form_site_csrf') ?? '';
  await request(app).post('/api/auth/logout').set('Origin', 'https://app.example.test')
    .set('Cookie', cookieHeader).set('X-CSRF-Token', csrf).expect(204);
});
