import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import type { CreateContractSubmissionInput } from '../../src/services/createContractSubmission.js';
import {
  ROUTE_ENVIRONMENT,
  ROUTE_RECEIPT,
  buildValidRouteRequest,
  createContractRouteTestApp,
} from './contracts-route-test-helpers.js';

test('POST validation exposes UI field names and performs no side effects', async () => {
  let configCalls = 0;
  let submissionCalls = 0;
  const app = createContractRouteTestApp({
    getConfig: () => {
      configCalls += 1;
      throw new Error('getConfig must not run');
    },
    createSubmission: async () => {
      submissionCalls += 1;
      return ROUTE_RECEIPT;
    },
  });

  const body = buildValidRouteRequest();
  const response = await request(app)
    .post('/api/contracts/submit')
    .set('X-User-Id', body.meta.userId)
    .send({ ...body, fields: {} });

  assert.equal(response.status, 400);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-request-id'], 'generated-request-id');
  assert.equal(response.body.error, 'VALIDATION_FAILED');
  assert.ok(response.body.errors.some(
    (issue: { field: string }) => issue.field === 'tenant_full_name',
  ));
  assert.ok(response.body.errors.every(
    (issue: { field: string }) => !issue.field.startsWith('fields.'),
  ));
  assert.equal(configCalls, 0);
  assert.equal(submissionCalls, 0);
});

test('POST returns typed authentication and owner-scope failures', async (t) => {
  const body = buildValidRouteRequest();

  await t.test('missing identity is 401', async () => {
    const response = await request(createContractRouteTestApp())
      .post('/api/contracts/submit')
      .send(body);
    assert.equal(response.status, 401);
    assert.equal(response.body.retriable, false);
    assert.equal(response.headers['cache-control'], 'no-store');
  });

  await t.test('wrong configured API key is 403', async () => {
    const response = await request(createContractRouteTestApp())
      .post('/api/contracts/submit')
      .set('Authorization', 'Bearer wrong-key')
      .send(body);
    assert.equal(response.status, 403);
    assert.equal(response.body.error, 'FORBIDDEN');
  });

  await t.test('gateway identity overrides body attribution', async () => {
    let captured: CreateContractSubmissionInput | undefined;
    const response = await request(createContractRouteTestApp({
      environment: { ...ROUTE_ENVIRONMENT, NODE_ENV: 'production' },
      createSubmission: async (input) => {
        captured = input;
        return ROUTE_RECEIPT;
      },
    }))
      .post('/api/contracts/submit')
      .set('X-Authenticated-User-Id', 'authoritative-user')
      .send(body);
    assert.equal(response.status, 200);
    assert.equal(captured?.submission.meta.userId, 'authoritative-user');
  });

  await t.test('development identity fails closed in production', async () => {
    const response = await request(createContractRouteTestApp({
      environment: { ...ROUTE_ENVIRONMENT, NODE_ENV: 'production' },
    }))
      .post('/api/contracts/submit')
      .set('X-User-Id', body.meta.userId)
      .send(body);
    assert.equal(response.status, 401);
  });
});

test('POST accepts gateway, API-key, and explicit development auth paths', async (t) => {
  const cases = [
    {
      name: 'gateway',
      environment: { ...ROUTE_ENVIRONMENT, NODE_ENV: 'production' },
      headers: { 'X-Authenticated-User-Id': 'user-123' },
      userId: 'user-123',
    },
    {
      name: 'api key attribution',
      environment: { ...ROUTE_ENVIRONMENT, NODE_ENV: 'production' },
      headers: { Authorization: 'Bearer route-test-api-key' },
      userId: 'attributed-user',
    },
    {
      name: 'development',
      environment: ROUTE_ENVIRONMENT,
      headers: { 'X-User-Id': 'user-123' },
      userId: 'user-123',
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      let pending = request(createContractRouteTestApp({
        environment: fixture.environment,
      }))
        .post('/api/contracts/submit');
      for (const [header, value] of Object.entries(fixture.headers)) {
        pending = pending.set(header, value);
      }
      const response = await pending.send(buildValidRouteRequest(fixture.userId));
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { receipt: ROUTE_RECEIPT });
    });
  }
});

test('POST returns the exact receipt and records bounded request context', async () => {
  let captured: CreateContractSubmissionInput | undefined;
  const app = createContractRouteTestApp({
    createSubmission: async (input) => {
      captured = input;
      return ROUTE_RECEIPT;
    },
  });
  const body = buildValidRouteRequest();
  const response = await request(app)
    .post('/api/contracts/submit')
    .set('X-User-Id', body.meta.userId)
    .set('X-Request-Id', 'client.request-123')
    .set('X-Forwarded-For', '203.0.113.77')
    .send(body);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { receipt: ROUTE_RECEIPT });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-request-id'], 'client.request-123');
  assert.ok(captured);
  assert.equal(captured.requestId, 'client.request-123');
  assert.equal(captured.ip, '203.0.113.77');

  const regenerated = await request(app)
    .post('/api/contracts/submit')
    .set('X-User-Id', body.meta.userId)
    .set('X-Request-Id', 'bad request id with spaces')
    .send(body);
  assert.equal(regenerated.headers['x-request-id'], 'generated-request-id');
});
