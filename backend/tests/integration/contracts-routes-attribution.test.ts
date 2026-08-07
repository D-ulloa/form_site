import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import type { CreateContractSubmissionInput } from '../../src/services/createContractSubmission.js';
import {
  ROUTE_RECEIPT,
  buildValidRouteRequest,
  createContractRouteTestApp,
} from './contracts-route-test-helpers.js';

test('development principal overrides client-provided audit attribution', async () => {
  let captured: CreateContractSubmissionInput | undefined;
  const response = await request(createContractRouteTestApp({
    createSubmission: async (input) => {
      captured = input;
      return ROUTE_RECEIPT;
    },
  }))
    .post('/api/contracts/submit')
    .set('X-User-Id', 'authoritative-dev-user')
    .send(buildValidRouteRequest('client-provided-user'));

  assert.equal(response.status, 200);
  assert.equal(captured?.submission.meta.userId, 'authoritative-dev-user');
});

test('API-key principal preserves explicit body attribution', async () => {
  let captured: CreateContractSubmissionInput | undefined;
  const response = await request(createContractRouteTestApp({
    createSubmission: async (input) => {
      captured = input;
      return ROUTE_RECEIPT;
    },
  }))
    .post('/api/contracts/submit')
    .set('Authorization', 'Bearer route-test-api-key')
    .send(buildValidRouteRequest('api-attributed-user'));

  assert.equal(response.status, 200);
  assert.equal(captured?.submission.meta.userId, 'api-attributed-user');
});
