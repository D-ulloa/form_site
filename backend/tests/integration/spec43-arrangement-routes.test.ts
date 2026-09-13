import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { arrangementHarness, environment, A, ORDER } from '../fixtures/arrangements.js';
import { createArrangementRequestsService } from '../../src/services/arrangementRequests.js';
import { ArrangementRequestError } from '../../src/arrangements/requestRepository.js';

function harness() {
  const calls: { action: string; input: Record<string, unknown> }[] = [];
  let conflict = false;
  const service = createArrangementRequestsService({ async call(scope, actor, action, input) {
    calls.push({ action, input });
    if (action === 'tenant.draft') return { id: ORDER, submission_state: 'draft', status: 'open', version: 1 };
    if (action === 'internal.status' && conflict) throw new ArrangementRequestError('VERSION_CONFLICT', 409, { id: ORDER, status: 'solved', version: 4 });
    if (action.endsWith('.list')) return { organization_id: scope.organization_id, property_id: action.startsWith('tenant') ? actor.membership.arrangement_property_id : null, items: [] };
    throw new Error('private provider token should never escape');
  } }, { storage: { async issueUpload() { throw new Error(); }, async inspect() { throw new Error(); }, async issueView() { throw new Error(); }, async remove() { return 'deleted'; } }, detectContent: async () => ({ detected_mime: 'image/png' }) }, environment);
  return { ...arrangementHarness(undefined, { requests: service }), calls, setConflict: () => { conflict = true; } };
}
const base = `/api/organizations/${A}/arrangements`;
test('SPEC43 HTTP requires tenant scope, property, CSRF and strict body before creating a hidden draft', async () => {
  const h = harness(); h.state.membership = { ...h.state.membership, role: 'inquilino', arrangement_property_id: ORDER };
  const post = (body: unknown) => request(h.app).post(`${base}/inquilino/order-drafts`).set('Cookie', `${h.cookie}; form_site_csrf=${h.material.csrf_token}`).set('Origin', 'https://app.example.test').set('X-CSRF-Token', h.material.csrf_token).set('Idempotency-Key', 'request-test-1').send(body);
  assert.equal((await request(h.app).post(`${base}/inquilino/order-drafts`).send({ description: 'Leak' })).status, 401);
  for (const extra of [{ property_id: ORDER }, { status: 'solved' }, { actor_id: ORDER }, { assets: [ORDER] }]) assert.equal((await post({ description: 'Leak', ...extra })).status, 400);
  const result = await post({ description: '  Leak  ' });
  assert.equal(result.status, 201); assert.equal(result.body.id, ORDER);
  assert.match(result.headers['cache-control'], /no-store/);
  assert.deepEqual(h.calls[0]?.input, { description: 'Leak', idempotency_key: 'request-test-1' });
  h.state.membership = { ...h.state.membership, arrangement_property_id: null };
  assert.equal((await post({ description: 'Leak' })).body.error, 'PROPERTY_REQUIRED');
  assert.equal(h.calls.length, 1);
});
test('SPEC43 internal/tenant role matrix, invalid filters, safe failures and version conflicts', async () => {
  for (const role of ['owner', 'admin', 'member', 'viewer', 'inquilino'] as const) {
    const h = harness(); h.state.membership = { ...h.state.membership, role, arrangement_property_id: role === 'inquilino' ? ORDER : null };
    assert.equal((await request(h.app).get(`${base}/orders`).set('X-Arrangement-Contract', '2').set('Cookie', `${h.cookie}; form_site_csrf=${h.material.csrf_token}`)).status, role === 'inquilino' ? 403 : 200);
    assert.equal((await request(h.app).get(`${base}/inquilino/orders`).set('Cookie', `${h.cookie}; form_site_csrf=${h.material.csrf_token}`)).status, role === 'inquilino' ? 200 : 403);
    h.setConflict();
    const response = await request(h.app).patch(`${base}/orders/${ORDER}/status`).set('Cookie', `${h.cookie}; form_site_csrf=${h.material.csrf_token}`).set('Origin', 'https://app.example.test').set('X-CSRF-Token', h.material.csrf_token).send({ status: 'open', expected_version: 1 });
    assert.equal(response.status, ['viewer', 'inquilino'].includes(role) ? 403 : 409);
    if (response.status === 409) assert.equal(response.body.current.version, 4);
  }
  const h = harness();
  for (const query of ['status=unknown', 'status=open&status=solved', 'limit=0', 'cursor=bad', 'property_id=' + ORDER]) assert.equal((await request(h.app).get(`${base}/orders?${query}`).set('X-Arrangement-Contract', '2').set('Cookie', `${h.cookie}; form_site_csrf=${h.material.csrf_token}`)).status, 400);
  h.state.allowed = false;
  assert.equal((await request(h.app).get(`${base}/orders`).set('X-Arrangement-Contract', '2').set('Cookie', `${h.cookie}; form_site_csrf=${h.material.csrf_token}`)).status, 429);
});

test('SPEC43 HTTP enforces aggregate upload limits and keeps dependency errors private', async () => {
  const h = harness(); h.state.membership = { ...h.state.membership, role: 'inquilino', arrangement_property_id: ORDER };
  const image = { receiver_key: 'arrangement.image', original_filename: 'image.png', declared_mime: 'image/png', declared_bytes: 10 * 1024 ** 2, checksum_sha256: 'a'.repeat(64) };
  const video = { receiver_key: 'arrangement.video', original_filename: 'video.mp4', declared_mime: 'video/mp4', declared_bytes: 100 * 1024 ** 2, checksum_sha256: 'b'.repeat(64) };
  for (const files of [Array(31).fill(image), Array(11).fill(video), [...Array(10).fill(video), ...Array(3).fill(image)]]) {
    const response = await request(h.app).post(`${base}/inquilino/order-drafts/${ORDER}/assets/sessions`)
      .set('Cookie', `${h.cookie}; form_site_csrf=${h.material.csrf_token}`).set('Origin', 'https://app.example.test')
      .set('X-CSRF-Token', h.material.csrf_token).set('Idempotency-Key', 'upload-limits').send({ files });
    assert.equal(response.status, 400); assert.equal(response.body.error, 'UPLOAD_INVALID');
  }
  assert.equal(h.calls.length, 0);
  const failure = await request(h.app).get(`${base}/inquilino/orders/${ORDER}/assets/${ORDER}/view`).set('Cookie', h.cookie);
  assert.equal(failure.status, 503); assert.doesNotMatch(failure.text, /private|provider|token should/);
});
