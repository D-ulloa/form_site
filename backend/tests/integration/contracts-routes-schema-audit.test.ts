import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import {
  ContractAuditIntegrityError,
  ContractAuditNotFoundError,
  InvalidContractSubmissionIdError,
} from '../../src/services/contractAuditLogger.js';
import {
  ROUTE_AUDIT,
  ROUTE_ENVIRONMENT,
  createContractRouteTestApp,
} from './contracts-route-test-helpers.js';

test('public schema response is direct, client-safe, and explicitly cacheable', async () => {
  const response = await request(createContractRouteTestApp())
    .get('/api/contracts/schemas/rent-contract-v1');

  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'public, max-age=300');
  assert.equal(response.body.schemaId, 'rent-contract-v1');
  assert.equal(response.body.googleFormLink, ROUTE_ENVIRONMENT.CONTRACT_GOOGLE_FORM_LINK);
  assert.ok(Array.isArray(response.body.sections));
  assert.equal('schema' in response.body, false);
  assert.equal('sheet' in response.body, false);
  assert.equal('columnMap' in response.body, false);
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes('spreadsheet-id'), false);
  assert.equal(serialized.includes('CONTRACTS_API_KEY'), false);
});

test('schema errors are no-store and use 404/500 status classes', async (t) => {
  await t.test('unknown schema', async () => {
    const response = await request(createContractRouteTestApp())
      .get('/api/contracts/schemas/missing-schema');
    assert.equal(response.status, 404);
    assert.equal(response.body.error, 'SCHEMA_NOT_FOUND');
    assert.equal(response.headers['cache-control'], 'no-store');
  });

  await t.test('invalid server config', async () => {
    const response = await request(createContractRouteTestApp({
      environment: {
        ...ROUTE_ENVIRONMENT,
        CONTRACT_GOOGLE_FORM_LINK: 'javascript:invalid',
      },
    })).get('/api/contracts/schemas/rent-contract-v1');
    assert.equal(response.status, 500);
    assert.equal(response.body.error, 'CONTRACT_CONFIGURATION_ERROR');
    assert.equal(response.body.retriable, false);
    assert.equal(response.headers['cache-control'], 'no-store');
  });
});

test('audit route enforces owner scope while API key may read any audit', async (t) => {
  await t.test('matching development owner', async () => {
    const response = await request(createContractRouteTestApp())
      .get(`/api/contracts/audits/${ROUTE_AUDIT.submissionId}`)
      .set('X-User-Id', ROUTE_AUDIT.userId);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, ROUTE_AUDIT);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-request-id'], 'generated-request-id');
  });

  await t.test('different gateway owner', async () => {
    const response = await request(createContractRouteTestApp({
      environment: { ...ROUTE_ENVIRONMENT, NODE_ENV: 'production' },
    }))
      .get(`/api/contracts/audits/${ROUTE_AUDIT.submissionId}`)
      .set('X-Authenticated-User-Id', 'different-user');
    assert.equal(response.status, 403);
    assert.equal(response.body.error, 'FORBIDDEN');
  });

  await t.test('API key', async () => {
    const response = await request(createContractRouteTestApp({
      environment: { ...ROUTE_ENVIRONMENT, NODE_ENV: 'production' },
    }))
      .get(`/api/contracts/audits/${ROUTE_AUDIT.submissionId}`)
      .set('Authorization', 'Bearer route-test-api-key');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, ROUTE_AUDIT);
  });
});

test('audit route classifies authentication, ID, missing, and integrity failures', async (t) => {
  await t.test('missing authentication', async () => {
    const response = await request(createContractRouteTestApp())
      .get(`/api/contracts/audits/${ROUTE_AUDIT.submissionId}`);
    assert.equal(response.status, 401);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  });

  const fixtures = [
    {
      name: 'invalid ID',
      id: 'BAD-ID',
      error: new InvalidContractSubmissionIdError(),
      status: 400,
      code: 'INVALID_SUBMISSION_ID',
    },
    {
      name: 'missing audit',
      id: 'SUB-2026-07-21-DEADBEEF',
      error: new ContractAuditNotFoundError(
        'SUB-2026-07-21-DEADBEEF',
        new Error('missing'),
      ),
      status: 404,
      code: 'AUDIT_NOT_FOUND',
    },
    {
      name: 'integrity failure',
      id: 'SUB-2026-07-21-DEADBEEF',
      error: new ContractAuditIntegrityError('SUB-2026-07-21-DEADBEEF'),
      status: 500,
      code: 'AUDIT_INTEGRITY_ERROR',
    },
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.name, async () => {
      const response = await request(createContractRouteTestApp({
        readAudit: async () => { throw fixture.error; },
      }))
        .get(`/api/contracts/audits/${fixture.id}`)
        .set('X-User-Id', ROUTE_AUDIT.userId);
      assert.equal(response.status, fixture.status);
      assert.equal(response.body.error, fixture.code);
      assert.equal(response.body.retriable, false);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
    });
  }
});
