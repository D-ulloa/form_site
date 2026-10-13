import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { createPropertyRecoveryDraftsRouter } from '../../src/routes/propertyRecoveryDrafts.js';
import type { SessionService } from '../../src/identity/sessionService.js';
import type { RecoveryDraftRepository, RecoveryDraftRow } from '../../src/properties/recoveryDraftRepository.js';
import { hashCsrfToken } from '../../src/identity/sessionSecurity.js';

const organizationId = '8bcdb84f-9380-4c50-b63b-84a9cc335281';
const userId = '5ef4d749-88ab-4b39-bc51-e5e939612669';
const draftId = '22222222-2222-4222-8222-222222222222';
const csrf = 'property-recovery-test-csrf';
const environment = { NODE_ENV: 'development', APP_CSRF_PEPPER: 'c'.repeat(32) } as NodeJS.ProcessEnv;

function draft(): RecoveryDraftRow {
  return {
    id: draftId, organization_id: organizationId, user_id: userId,
    form_values: { Titulo: 'Casa', Calle: 'Falsa' }, media_manifest: [], cover_file_name: '',
    status: 'open', last_error: null, submission_id: null, property_id: null, version: 1,
    created_at: '2026-10-12T00:00:00.000Z', updated_at: '2026-10-12T00:00:00.000Z',
  };
}

function harness() {
  const calls: Array<{ action: string; organization: string; user: string; details?: unknown }> = [];
  const sessions = {
    async authenticate() {
      return { session: { csrf_token_hash: hashCsrfToken(csrf, environment) }, identity: { id: userId } };
    },
    async context(_request: unknown, organization: string) {
      assert.equal(organization, 'azar');
      return { organization: { id: organizationId }, user_id: userId };
    },
  } as unknown as SessionService;
  const repository = {
    async list(scope, user) {
      calls.push({ action: 'list', organization: scope.organization_id, user });
      return [draft()];
    },
    async find(scope, user) {
      calls.push({ action: 'find', organization: scope.organization_id, user });
      return draft();
    },
    async create(scope, user, snapshot) {
      calls.push({ action: 'create', organization: scope.organization_id, user, details: snapshot });
      return draft();
    },
    async save(scope, user) {
      calls.push({ action: 'save', organization: scope.organization_id, user });
      return draft();
    },
    async recordFailure(scope, user, _draftId, version, snapshot, failure) {
      calls.push({ action: 'failure', organization: scope.organization_id, user,
        details: { version, snapshot, failure } });
      return { ...draft(), version: 2, last_error: failure };
    },
    async close(scope, user) {
      calls.push({ action: 'close', organization: scope.organization_id, user });
    },
  } as RecoveryDraftRepository;
  const app = express();
  app.use(express.json());
  app.use('/api/organizations/:organization/properties/recovery-drafts',
    createPropertyRecoveryDraftsRouter(sessions, repository, environment));
  return { app, calls };
}

test('draft list exposes only a summary and uses authenticated scope', async () => {
  const { app, calls } = harness();
  const response = await request(app).get('/api/organizations/azar/properties/recovery-drafts');
  assert.equal(response.status, 200);
  assert.equal(response.body.drafts[0].title, 'Casa');
  assert.equal(response.body.drafts[0].form_values, undefined);
  assert.deepEqual(calls[0], { action: 'list', organization: organizationId, user: userId });
});

test('draft create rejects browser actor fields and missing CSRF', async () => {
  const { app, calls } = harness();
  const url = '/api/organizations/azar/properties/recovery-drafts';
  const body = { formValues: { Titulo: 'Casa', agent_user_id: 'forged' },
    mediaManifest: [], coverFileName: '' };
  const noCsrf = await request(app).post(url).send(body);
  assert.equal(noCsrf.status, 403);
  const actor = await request(app).post(url).set('X-CSRF-Token', csrf)
    .set('Cookie', `form_site_csrf=${csrf}`).send(body);
  assert.equal(actor.status, 400);
  assert.equal(calls.length, 0);
});

test('failure endpoint passes the latest snapshot and diagnostic with version and scope', async () => {
  const { app, calls } = harness();
  const response = await request(app)
    .post(`/api/organizations/azar/properties/recovery-drafts/${draftId}/failures`)
    .set('X-CSRF-Token', csrf).set('Cookie', `form_site_csrf=${csrf}`)
    .send({ expectedVersion: 1, formValues: { Titulo: 'Casa nueva', Calle: 'Falsa' },
      mediaManifest: [], coverFileName: '', failure: {
        phase: 'submit', code: 'PARTIAL_FAILURE', message: 'Make falló',
        outcome: 'partial_failure', submissionId: 'SUB-123', steps: { make: 'failed' },
      } });
  assert.equal(response.status, 201);
  assert.equal(response.body.draft.version, 2);
  assert.deepEqual(calls[0], {
    action: 'failure', organization: organizationId, user: userId,
    details: { version: 1,
      snapshot: { formValues: { Titulo: 'Casa nueva', Calle: 'Falsa' }, mediaManifest: [], coverFileName: '' },
      failure: { phase: 'submit', code: 'PARTIAL_FAILURE', message: 'Make falló',
        outcome: 'partial_failure', submissionId: 'SUB-123', steps: { make: 'failed' } },
    },
  });
});
