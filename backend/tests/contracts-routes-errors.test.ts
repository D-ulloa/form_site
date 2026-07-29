import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { ContractConfigurationError } from '../src/config/contractSchemas.js';
import { ContractMappingError } from '../src/mappers/contractSheetRowMapper.js';
import { ContractAuditPersistenceError } from '../src/services/createContractSubmission.js';
import { ContractSheetMappingConfigurationError } from '../src/services/contractSheetHeaderValidation.js';
import { ContractSheetsAppendError } from '../src/services/contractSheetsErrors.js';
import { GoogleServiceAccountConfigurationError } from '../src/utils/googleServiceAccountAuth.js';
import {
  buildValidRouteRequest,
  createContractRouteTestApp,
} from './contracts-route-test-helpers.js';

function authorizedPost(app: ReturnType<typeof createContractRouteTestApp>) {
  const body = buildValidRouteRequest();
  return request(app)
    .post('/api/contracts/submit')
    .set('X-User-Id', body.meta.userId)
    .send(body);
}

test('POST maps Sheets failures to truthful 502 and 503 responses', async (t) => {
  for (const fixture of [
    { retriable: false, status: 502 },
    { retriable: true, status: 503 },
  ]) {
    await t.test(String(fixture.status), async () => {
      const app = createContractRouteTestApp({
        createSubmission: async () => {
          throw new ContractSheetsAppendError({
            message: 'Google Sheets append failed safely.',
            retriable: fixture.retriable,
            providerStatus: fixture.status,
          });
        },
      });
      const response = await authorizedPost(app);
      assert.equal(response.status, fixture.status);
      assert.equal(response.body.retriable, fixture.retriable);
      assert.equal(response.body.error, 'GOOGLE_SHEETS_APPEND_FAILED');
      assert.equal(response.headers['cache-control'], 'no-store');
    });
  }
});

test('POST maps mapping and administrative configuration failures to guided 500s', async (t) => {
  const failures = [
    new ContractMappingError('Column map is incomplete. Update the schema mapping.'),
    new ContractSheetMappingConfigurationError(['Expected'], ['Actual']),
    new ContractConfigurationError(['CONTRACT_GOOGLE_SHEET_ID']),
    new GoogleServiceAccountConfigurationError(
      'GOOGLE_SERVICE_ACCOUNT_KEY_JSON is required for contract Sheet writes.',
    ),
  ];

  for (const failure of failures) {
    await t.test(failure.name, async () => {
      const response = await authorizedPost(createContractRouteTestApp({
        createSubmission: async () => { throw failure; },
      }));
      assert.equal(response.status, 500);
      assert.equal(response.body.retriable, false);
      assert.match(response.body.error, /CONFIGURATION|MAPPING/u);
    });
  }
});

test('POST audit-after-append failure returns reconciliation identifiers', async () => {
  const app = createContractRouteTestApp({
    createSubmission: async () => {
      throw new ContractAuditPersistenceError({
        submissionId: 'SUB-2026-07-21-DEADBEEF',
        requestId: 'reconcile-request-id',
        cause: new Error('disk unavailable'),
      });
    },
  });
  const response = await authorizedPost(app);

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    error: 'CONTRACT_AUDIT_PERSISTENCE_FAILED',
    message: 'The Sheet row was appended, but its audit receipt could not be persisted. Reconcile the submission before retrying.',
    retriable: false,
    appendCompleted: true,
    submissionId: 'SUB-2026-07-21-DEADBEEF',
    requestId: 'reconcile-request-id',
  });
});

test('POST unknown schema is 404 before configuration or side effects', async () => {
  let configCalls = 0;
  let createCalls = 0;
  const body = buildValidRouteRequest();
  const app = createContractRouteTestApp({
    getConfig: () => {
      configCalls += 1;
      throw new Error('unexpected config call');
    },
    createSubmission: async () => {
      createCalls += 1;
      throw new Error('unexpected create call');
    },
  });
  const response = await request(app)
    .post('/api/contracts/submit')
    .set('X-User-Id', body.meta.userId)
    .send({ ...body, schemaId: 'missing-schema' });

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'SCHEMA_NOT_FOUND');
  assert.equal(configCalls, 0);
  assert.equal(createCalls, 0);
});

test('POST logs only sanitized operational metadata for unexpected errors', async () => {
  const entries: unknown[] = [];
  const secretMessage = 'raw-secret-payload-should-not-be-logged';
  const response = await authorizedPost(createContractRouteTestApp({
    createSubmission: async () => { throw new Error(secretMessage); },
    log: (entry) => { entries.push(entry); },
  }));

  assert.equal(response.status, 500);
  assert.equal(JSON.stringify(response.body).includes(secretMessage), false);
  assert.equal(JSON.stringify(entries).includes(secretMessage), false);
  assert.deepEqual(entries, [{
    event: 'contract_route_error',
    route: 'submit',
    status: 500,
    errorName: 'Error',
    requestId: 'generated-request-id',
  }]);
});
