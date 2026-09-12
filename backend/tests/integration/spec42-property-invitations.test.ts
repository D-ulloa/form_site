import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { arrangementHarness, A, environment } from '../fixtures/arrangements.js';
import { createArrangementPropertiesService } from '../../src/services/arrangementProperties.js';
import type { ArrangementPropertyRepository } from '../../src/arrangements/arrangementPropertyRepository.js';

const P = '60000000-0000-4000-8000-000000000001';
const route = `/api/organizations/${A}/arrangements/properties`;
function harness() {
  let writes = 0, invitations = 0;
  const properties = createArrangementPropertiesService({
    async list() { return { organization_id: A, items: [{ id: P, name: 'Casa' }] }; },
    async create(_scope, input) { writes++; return { id: P, name: input.name }; },
  } as ArrangementPropertyRepository, environment);
  return { ...arrangementHarness(undefined, { properties, organizations: { async inviteMember(input) {
    invitations++; assert.equal(input.intended_role, 'inquilino'); assert.equal(input.arrangement_property_id, P);
    return { invitation_id: P, status: 'pending', delivery_state: 'pending', delivery_method: 'share_link' as const,
      expires_at: '2099-01-01T00:00:00Z', next_action: 'copy_or_revoke' as const };
  } } }), counts: () => ({ writes, invitations }) };
}

test('SPEC-42 real router applies CSRF and origin checks before property writes', async () => {
  const h = harness();
  await request(h.app).post(route).send({ name: 'Casa' }).expect(401);
  await request(h.app).post(route).set('Cookie', h.cookie).send({ name: 'Casa' }).expect(403);
  await request(h.app).post(route).set('Cookie', h.cookie).set('X-CSRF-Token', h.material.csrf_token)
    .set('Origin', 'https://foreign.example.test').send({ name: 'Casa' }).expect(403);
  assert.equal(h.counts().writes, 0);
  const result = await request(h.app).post(route).set('Cookie', `${h.cookie}; form_site_csrf=${h.material.csrf_token}`)
    .set('X-CSRF-Token', h.material.csrf_token).set('Origin', 'https://app.example.test').set('Idempotency-Key', 'property-attempt')
    .send({ name: ' Casa ' }).expect(201);
  assert.deepEqual(result.body, { id: P, name: 'Casa' }); assert.equal(h.counts().writes, 1);
  assert.equal(result.headers['cache-control'], 'no-store');
});

test('SPEC-42 roles get only property names/IDs and no unauthorized mutations', async () => {
  const h = harness();
  for (const role of ['member', 'viewer'] as const) {
    h.state.membership = { ...h.state.membership, role };
    const result = await request(h.app).get(route).set('Cookie', h.cookie).expect(200);
    assert.deepEqual(result.body.items, [{ id: P, name: 'Casa' }]);
    await request(h.app).get(`${route}/${P}/invitations`).set('Cookie', h.cookie).expect(403);
    await request(h.app).post(route).set('Cookie', `${h.cookie}; form_site_csrf=${h.material.csrf_token}`)
      .set('X-CSRF-Token', h.material.csrf_token).set('Origin', 'https://app.example.test').send({ name: 'Casa' }).expect(403);
  }
  h.state.membership = { ...h.state.membership, role: 'inquilino' };
  await request(h.app).get(route).set('Cookie', h.cookie).expect(403);
  assert.equal(h.counts().writes, 0);
});

test('SPEC-42 invitation HTTP input fixes role and property server-side, rejecting authority injection', async () => {
  const h = harness();
  for (const body of [{ email: 'new@example.test', role: 'owner' }, { email: 'new@example.test', arrangement_property_id: P },
    { email: 'new@example.test', organization_id: A }]) {
    await request(h.app).post(`${route}/${P}/invitations`).set('Cookie', `${h.cookie}; form_site_csrf=${h.material.csrf_token}`)
      .set('X-CSRF-Token', h.material.csrf_token).set('Origin', 'https://app.example.test').set('Idempotency-Key', 'invite-attempt').send(body).expect(400);
  }
  await request(h.app).post(`${route}/${P}/invitations`).set('Cookie', `${h.cookie}; form_site_csrf=${h.material.csrf_token}`)
    .set('X-CSRF-Token', h.material.csrf_token).set('Origin', 'https://app.example.test').set('Idempotency-Key', 'invite-attempt')
    .send({ email: 'new@example.test' }).expect(201);
  assert.equal(h.counts().invitations, 1);
});
