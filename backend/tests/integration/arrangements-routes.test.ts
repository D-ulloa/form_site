import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { A, B, ORDER, arrangementHarness } from '../fixtures/arrangements.js';

const route = '/api/organizations/azar/arrangements/orders';
for (const role of ['owner', 'admin', 'member', 'viewer'] as const) {
  test(`SPEC-39 ${role} reads minimal orders in the confirmed organization`, async () => {
    const { app, cookie, state } = arrangementHarness();
    state.membership = { ...state.membership, role };
    const result = await request(app).get(route).set('Cookie', cookie).expect(200);
    assert.deepEqual(result.body, { organization_id: A,
      items: [{ id: ORDER, name: 'Ventana', status: 'open' }], available_statuses: ['open'], next_cursor: null });
    assert.deepEqual(state.reads, [{ organization_id: A, status: null }]);
    assert.equal(result.headers['cache-control'], 'no-store');
  });
}

test('SPEC-39 rejects missing, invalid, expired and revoked sessions before protected dependencies', async () => {
  const { app, cookie, state } = arrangementHarness();
  await request(app).get(route).expect(401);
  await request(app).get(route).set('Cookie', 'form_site_session=invalid').expect(401);
  state.session = { ...state.session, absolute_expires_at: '2000-01-01T00:00:00Z' };
  await request(app).get(route).set('Cookie', cookie).expect(401);
  state.session = { ...state.session, absolute_expires_at: '2099-01-01T00:00:00Z', revoked_at: new Date().toISOString() };
  await request(app).get(route).set('Cookie', cookie).expect(401);
  assert.equal(state.limiterCalls, 0);
  assert.equal(state.reads.length, 0);
});

test('SPEC-39 denies another organization by slug and UUID without disclosing data', async () => {
  const { app, cookie, state } = arrangementHarness();
  for (const organization of ['solar', B, 'missing']) {
    const result = await request(app).get(`/api/organizations/${organization}/arrangements/orders`).set('Cookie', cookie).expect(404);
    assert.deepEqual(result.body, { error: 'NOT_FOUND', retriable: false });
  }
  assert.equal(state.reads.length, 0);
  assert.equal(state.limiterCalls, 0);
  await request(app).get(`/api/organizations/${A}/arrangements/orders`).set('Cookie', cookie).expect(200);
});

test('SPEC-39 revalidates memberships and organization capabilities on every request', async () => {
  const { app, cookie, state } = arrangementHarness();
  for (const status of ['suspended', 'removed'] as const) {
    state.membership = { ...state.membership, status };
    await request(app).get(route).set('Cookie', cookie).expect(404);
  }
  state.membership = { ...state.membership, status: 'active' };
  for (const status of ['suspended', 'pending_deletion', 'deleted'] as const) {
    state.organization = { ...state.organization, status };
    await request(app).get(route).set('Cookie', cookie).expect(status === 'deleted' ? 404 : 403);
  }
  assert.equal(state.reads.length, 0);
});

test('SPEC-39 forwards exact status and treats no matches as empty, not all', async () => {
  const { app, cookie, state } = arrangementHarness();
  for (const status of ['open', 'in_progress', 'closed', 'unknown']) {
    const result = await request(app).get(route).query({ status }).set('Cookie', cookie).expect(200);
    assert.equal(state.reads.at(-1)?.status, status);
    assert.equal(result.body.items.length, status === 'open' ? 1 : 0);
    assert.deepEqual(result.body.available_statuses, ['open']);
  }
});

test('SPEC-39 rejects ambiguous query parameters and invalid pagination', async () => {
  const { app, cookie, state } = arrangementHarness();
  for (const query of ['status=open&status=closed', 'status=', 'status=%20open', 'limit=0', 'limit=101',
    'limit=1.5', 'limit=1&limit=2', 'cursor=invalid', 'organization_id=' + B, 'status=' + 'a'.repeat(65)]) {
    await request(app).get(`${route}?${query}`).set('Cookie', cookie).expect(400);
  }
  assert.equal(state.reads.length, 0);
});

test('SPEC-39 distributed read limits fail closed with safe errors', async () => {
  const { app, cookie, state } = arrangementHarness();
  state.allowed = false;
  const limited = await request(app).get(route).set('Cookie', cookie).expect(429);
  assert.equal(limited.headers['retry-after'], '60');
  state.limiterUnavailable = true;
  const unavailable = await request(app).get(route).set('Cookie', cookie).expect(503);
  assert.equal(unavailable.body.error.code, 'LIMITER_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(unavailable.body), /private/);
  assert.equal(state.reads.length, 0);
});

test('SPEC-39 does not expose a creation or update endpoint', async () => {
  const { app, cookie, state } = arrangementHarness();
  await request(app).post(route).set('Cookie', cookie).send({ name: 'New' }).expect(404);
  assert.equal(state.reads.length, 0);
});
