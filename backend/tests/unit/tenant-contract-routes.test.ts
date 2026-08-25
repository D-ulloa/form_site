import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { createTenantContractEntriesRouter } from '../../src/routes/tenantContractEntries.js';
import type { SessionService } from '../../src/identity/sessionService.js';
import type { TenantContractHttpRepository } from '../../src/contracts/tenantContractHttpRepository.js';
import { hashCsrfToken } from '../../src/identity/sessionSecurity.js';
import { requestIdMiddleware } from '../../src/platform/requestId.js';

const organizationId = '8bcdb84f-9380-4c50-b63b-84a9cc335281';
const userId = '5ef4d749-88ab-4b39-bc51-e5e939612669';
const membershipId = '11111111-1111-4111-8111-111111111111';
const csrf = 'csrf-token-for-tenant-contract-test';
const environment = {
  NODE_ENV: 'development', APP_CSRF_PEPPER: 'c'.repeat(32),
  CONTRACT_TOKEN_SECRET: 't'.repeat(32), CONTRACT_PUBLIC_BASE_URL: 'http://localhost:5173',
} as NodeJS.ProcessEnv;

function entry(id = '22222222-2222-4222-8222-222222222222') {
  return { id, schemaId: 'rent-contract-v1', direccion: 'Test 123', createdBy: 'Owner',
    createdByUserId: userId, createdAt: '2026-08-20T00:00:00.000Z',
    userTokenHash: `v1:${'a'.repeat(64)}`, clientTokenHash: `v1:${'b'.repeat(64)}`,
    userFilled: false, clientFilled: false, userSubmittedAt: null, clientSubmittedAt: null,
    userSubmission: null, clientSubmission: null, combinedSubmission: null,
    status: 'open' as const, archivedAt: null, version: 1 };
}

function harness() {
  const calls: Array<{ organization_id: string; actor_user_id: string }> = [];
  const sessions = {
    async authenticate() { return { session: { csrf_token_hash: hashCsrfToken(csrf, environment) } }; },
    async context(_request: unknown, organization: string) {
      assert.equal(organization, 'azar');
      return { organization: { id: organizationId, slug: 'azar' }, membership: { id: membershipId },
        user_id: userId };
    },
  } as unknown as SessionService;
  const repository = {
    async create(scope, actor, input) {
      calls.push({ organization_id: scope.organization_id, actor_user_id: actor.user_id });
      return entry(input.id);
    },
    async list(scope) { assert.equal(scope.organization_id, organizationId); return [entry()]; },
    async find() { return entry(); }, async submissions() { return []; },
    async setStatus() { return entry(); }, async archive() { return entry(); },
    async replaceToken() { return entry(); }, async appendRevision() { return entry(); },
  } satisfies TenantContractHttpRepository;
  const app = express();
  app.use(requestIdMiddleware, express.json());
  app.use('/api/organizations/:organization/contracts',
    createTenantContractEntriesRouter(sessions, repository, environment));
  return { app, calls };
}

test('tenant contract list uses the server-confirmed organization scope', async () => {
  const { app } = harness();
  const response = await request(app).get('/api/organizations/azar/contracts/admin/entries');
  assert.equal(response.status, 200);
  assert.equal(response.body.entries.length, 1);
});

test('tenant contract creation uses session actor, CSRF, and confirmed organization UUID', async () => {
  const { app, calls } = harness();
  const response = await request(app).post('/api/organizations/azar/contracts/create')
    .set('Origin', 'http://localhost:5173').set('X-CSRF-Token', csrf)
    .set('Cookie', `form_site_csrf=${csrf}`).send({ Direccion: 'Test 123' });
  assert.equal(response.status, 201);
  assert.equal(response.body.adminUrl.includes('/t/azar/contracts/admin/'), true);
  assert.deepEqual(calls, [{ organization_id: organizationId, actor_user_id: userId }]);
});

test('tenant contract creation rejects missing CSRF before persistence', async () => {
  const { app, calls } = harness();
  const response = await request(app).post('/api/organizations/azar/contracts/create')
    .set('Origin', 'http://localhost:5173').send({ Direccion: 'Test 123' });
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});
