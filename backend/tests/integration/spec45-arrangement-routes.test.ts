import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { arrangementHarness, A, B, ORDER, environment } from '../fixtures/arrangements.js';
import { createArrangementRequestsService } from '../../src/services/arrangementRequests.js';
import { SessionService } from '../../src/identity/sessionService.js';
const base = `/api/organizations/${A}/arrangements`;
function harness() {
  const calls: string[] = [];
  const service = createArrangementRequestsService({ async call(scope, actor, action) {
    calls.push(action);
    if (action.endsWith('.changes')) return { revision: '0' };
    if (action.endsWith('.assignees')) return { organization_id: A, items: [] };
    if (action.endsWith('.list')) return { organization_id: scope.organization_id, property_id: actor.membership.role === 'inquilino' ? ORDER : null, items: [] };
    return { id: ORDER, organization_id: A, name: 'Request', description: 'Request', status: 'in_progress', property: { id: ORDER, name: 'Casa' },
      created_at: null, submitted_at: null, updated_at: null, version: 3, legacy: false, created_by_you: false, assets: [], requester: null,
      ...(actor.membership.role === 'personal' ? {} : { assignee: null }) };
  } }, { storage: {} as never, detectContent: async () => ({ detected_mime: 'image/png' }) }, environment);
  return { ...arrangementHarness(undefined, { requests: service }), calls };
}
test('SPEC45 HTTP separates personal routes, dedicated selector and manager mutations with scope and CSRF', async () => {
  const h = harness();
  const mutate = (body: unknown) => request(h.app).patch(`${base}/orders/${ORDER}/assignment`)
    .set('Cookie', `${h.cookie}; form_site_csrf=${h.material.csrf_token}`).set('Origin', 'https://app.example.test')
    .set('X-CSRF-Token', h.material.csrf_token).send(body);
  for (const role of ['owner', 'admin', 'member', 'viewer', 'inquilino', 'personal'] as const) {
    h.state.membership = { ...h.state.membership, role, arrangement_property_id: role === 'inquilino' ? ORDER : null };
    await request(h.app).get(`${base}/personal/orders`).set('Cookie', h.cookie).expect(role === 'personal' ? 200 : 403);
    await request(h.app).get(`${base}/personal/assignees`).set('Cookie', h.cookie).expect(['owner', 'admin', 'member'].includes(role) ? 200 : 403);
    await mutate({ assigned_personal_membership_id: ORDER, expected_version: 2 }).expect(['owner', 'admin', 'member'].includes(role) ? 200 : 403);
  }
  h.state.membership = { ...h.state.membership, role: 'member' };
  const before = h.calls.length;
  for (const extra of [{ role: 'owner' }, { organization_id: B }, { user_id: ORDER }]) await mutate({ assigned_personal_membership_id: ORDER, expected_version: 2, ...extra }).expect(400);
  await request(h.app).patch(`${base}/orders/${ORDER}/assignment`).set('Cookie', h.cookie).send({ assigned_personal_membership_id: ORDER, expected_version: 2 }).expect(403);
  await request(h.app).get(`/api/organizations/${B}/arrangements/personal/assignees`).set('Cookie', h.cookie).expect(404);
  assert.equal(h.calls.length, before);
});
test('SPEC45 personal list rejects caller-selected membership/property and inactive sessions', async () => {
  const h = harness(); h.state.membership = { ...h.state.membership, role: 'personal' };
  for (const query of ['status=solved', `membership_id=${ORDER}`, `property_id=${ORDER}`, 'cursor=bad']) await request(h.app).get(`${base}/personal/orders?${query}`).set('Cookie', h.cookie).expect(400);
  assert.equal(h.calls.length, 0);
  h.state.membership = { ...h.state.membership, status: 'suspended' };
  await request(h.app).get(`${base}/personal/orders/${ORDER}`).set('Cookie', h.cookie).expect(404);
  h.state.membership = { ...h.state.membership, status: 'active' }; h.state.session = { ...h.state.session, revoked_at: new Date().toISOString() };
  await request(h.app).get(`${base}/changes`).set('Cookie', h.cookie).expect(401);
});

test('SPEC45 stream connections and renewals preserve idle expiry and revalidate revocation', async () => {
  const h = harness(); h.state.membership = { ...h.state.membership, role: 'personal' };
  h.state.session = { ...h.state.session, last_seen_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    idle_expires_at: new Date(Date.now() + 60_000).toISOString() };
  let touches = 0;
  h.identity.touchSession = async () => { touches += 1; return h.state.session; };
  const server = h.app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${base}/changes`;
  try {
    for (let connection = 0; connection < 2; connection += 1) {
      const controller = new AbortController();
      try {
        const response = await fetch(url, { headers: { Cookie: h.cookie }, signal: controller.signal });
        assert.equal(response.status, 200);
        const reader = response.body!.getReader();
        assert.equal(new TextDecoder().decode((await reader.read()).value), 'event: ready\ndata: {"revision":"0"}\n\n');
        assert.equal(touches, 0);
        if (connection === 1) {
          h.state.session = { ...h.state.session, revoked_at: new Date().toISOString() };
          assert.equal(new TextDecoder().decode((await reader.read()).value), 'event: revoked\ndata: {}\n\n');
          assert.equal((await reader.read()).done, true);
        }
      } finally { controller.abort(); }
    }
    assert.equal(touches, 0);
    await request(h.app).get(`${base}/changes`).set('Cookie', h.cookie).expect(401);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('SPEC45 membership summaries expose rejection only when enabled', async () => {
  const h = harness();
  h.identity.listMemberships = async () => [{ membership: h.state.membership, organization: h.state.organization }];
  for (const enabled of [false, true]) {
    const sessions = new SessionService(h.identity, { ...environment, ARRANGEMENT_REJECTION_ENABLED: String(enabled) });
    const [membership] = await sessions.memberships(h.state.membership.user_id);
    assert.equal(membership?.capabilities.includes('arrangements.request.reject'), enabled);
    assert.equal(membership?.capabilities.includes('arrangements.assignment.manage'), true);
  }
});
