import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { getContractRoleSchema } from '../src/config/contractSchemas.js';
import type {
  ContractEntryRecord,
  ContractFieldDefinition,
  ContractFieldValue,
  ContractRole,
  ContractSubmissionRecord,
} from '../src/contracts/types.js';
import { createContractEntriesRouter } from '../src/routes/contractEntries.js';
import type {
  ContractEntryRepository,
  CreateContractEntryRecordInput,
  SaveContractRoleSubmissionInput,
} from '../src/services/contractEntryRepository.js';
import {
  hashContractAccessToken,
  verifyContractAccessToken,
} from '../src/services/contractTokenService.js';
import { serializeContractPasswordSessionCookie } from '../src/services/contractPasswordAuth.js';

const ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  CONTRACT_TOKEN_SECRET: 'spec-10-test-secret-that-is-at-least-32-chars',
  CONTRACT_PUBLIC_BASE_URL: 'https://contracts.example.test',
  CONTRACT_ADMIN_USER_IDS: 'agent-001',
};

class MemoryContractRepository implements ContractEntryRepository {
  entry: ContractEntryRecord | null = null;
  submissions: ContractSubmissionRecord[] = [];

  async createEntry(input: CreateContractEntryRecordInput): Promise<ContractEntryRecord> {
    this.entry = {
      id: input.id,
      schemaId: input.schemaId,
      createdBy: input.createdBy,
      createdAt: input.createdAt,
      userTokenHash: input.userTokenHash,
      clientTokenHash: input.clientTokenHash,
      userFilled: false,
      clientFilled: false,
      userSubmittedAt: null,
      clientSubmittedAt: null,
      userSubmission: null,
      clientSubmission: null,
      combinedSubmission: null,
      status: 'open',
      archivedAt: null,
    };
    return this.entry;
  }

  async findEntry(entryId: string): Promise<ContractEntryRecord | null> {
    return this.entry?.id === entryId ? this.entry : null;
  }

  async listEntries(): Promise<readonly ContractEntryRecord[]> {
    return this.entry ? [this.entry] : [];
  }

  async listSubmissions(entryId: string): Promise<readonly ContractSubmissionRecord[]> {
    return this.submissions.filter((submission) => submission.entryId === entryId);
  }

  async saveRoleSubmission(input: SaveContractRoleSubmissionInput): Promise<ContractEntryRecord> {
    assert.ok(this.entry);
    this.submissions.push({
      id: input.submissionId,
      entryId: input.entryId,
      role: input.role,
      submission: input.fields,
      metadata: input.metadata,
      submittedAt: input.submittedAt,
    });
    const userSubmission = input.role === 'user' ? input.fields : this.entry.userSubmission;
    const clientSubmission = input.role === 'client' ? input.fields : this.entry.clientSubmission;
    const userFilled = input.role === 'user' || this.entry.userFilled;
    const clientFilled = input.role === 'client' || this.entry.clientFilled;
    this.entry = {
      ...this.entry,
      userSubmission,
      clientSubmission,
      userFilled,
      clientFilled,
      userSubmittedAt: input.role === 'user' ? input.submittedAt : this.entry.userSubmittedAt,
      clientSubmittedAt: input.role === 'client' ? input.submittedAt : this.entry.clientSubmittedAt,
      status: userFilled && clientFilled ? 'complete' : 'open',
      combinedSubmission: userFilled && clientFilled
        ? { user: userSubmission, client: clientSubmission }
        : null,
    };
    return this.entry;
  }

  async archiveEntry(entryId: string, archivedAt: string): Promise<ContractEntryRecord> {
    assert.equal(this.entry?.id, entryId);
    this.entry = { ...(this.entry as ContractEntryRecord), status: 'archived', archivedAt };
    return this.entry;
  }

  async replaceTokenHash(
    entryId: string,
    role: ContractRole,
    tokenHash: string,
    _occurredAt: string,
  ): Promise<ContractEntryRecord> {
    assert.equal(this.entry?.id, entryId);
    this.entry = {
      ...(this.entry as ContractEntryRecord),
      ...(role === 'user' ? { userTokenHash: tokenHash } : { clientTokenHash: tokenHash }),
    };
    return this.entry;
  }
}

function valueFor(field: ContractFieldDefinition): ContractFieldValue {
  if (field.type === 'email') return `${field.name}@example.test`;
  if (field.type === 'number') return field.min ?? 1;
  if (field.type === 'date') return '2026-08-01';
  if (field.type === 'boolean') return false;
  if (field.type === 'select') return field.options?.[0] ?? '';
  return `${field.name} value`;
}

function evidenceReference(entryId: string) {
  const storagePath = `contracts/${entryId}/client/garantes/0/`
    + 'recibo_sueldo_files/22222222-2222-4222-8222-222222222222-recibo.pdf';
  return {
    filename: 'recibo.pdf',
    mimeType: 'application/pdf',
    size: 1000,
    storagePath,
    storageBucket: 'contract-evidence',
  };
}

function validRoleFields(
  role: ContractRole,
  entryId?: string,
): Record<string, unknown> {
  const schema = getContractRoleSchema('rent-contract-v1', role);
  if (role === 'client') {
    assert.ok(entryId);
    return Object.fromEntries(schema.sections.map((section) => [
      section.repeatable?.name ?? section.title,
      [{
        ...Object.fromEntries(section.fields
        .filter((field) => field.required && !field.computed)
        .map((field) => [field.name, valueFor(field)])),
        ...(section.repeatable?.name === 'garantes'
          ? {
              guarantor_company: 'Empresa de prueba',
              recibo_sueldo_files: [evidenceReference(entryId)],
            }
          : {}),
      }],
    ]));
  }
  return Object.fromEntries(schema.sections.flatMap((section) =>
    section.fields
      .filter((field) => field.required && !field.computed)
      .map((field) => [field.name, valueFor(field)])));
}

function createApp(
  repository: ContractEntryRepository,
  environment: NodeJS.ProcessEnv = ENVIRONMENT,
) {
  const app = express();
  app.use(express.json());
  app.use('/api/contracts', createContractEntriesRouter({
    environment,
    repository,
    now: () => new Date('2026-07-24T12:00:00.000Z'),
    issueEvidenceViewUrl: async () => ({
      viewUrl: 'https://storage.example.test/evidence',
      expiresAt: '2026-07-24T12:10:00.000Z',
    }),
    verifyEvidenceReferences: async () => [],
  }));
  return app;
}

test('SPEC-19 signed administrator sessions authorize the contract admin routes', async () => {
  const repository = new MemoryContractRepository();
  const cookie = serializeContractPasswordSessionCookie({
    userId: '55555555-5555-4555-8555-555555555555',
    email: 'admin@example.test',
    name: 'Admin Example',
    isAdmin: true,
  }, ENVIRONMENT).split(';', 1)[0];

  await request(createApp(repository))
    .get('/api/contracts/admin/entries')
    .set('Cookie', cookie ?? '')
    .expect(200, { entries: [] });

  const nonAdminCookie = serializeContractPasswordSessionCookie({
    userId: '66666666-6666-4666-8666-666666666666',
    email: 'user@example.test',
    name: 'Regular User',
    isAdmin: false,
  }, ENVIRONMENT).split(';', 1)[0];

  await request(createApp(repository))
    .get('/api/contracts/admin/entries')
    .set('Cookie', nonAdminCookie ?? '')
    .expect(403);
});

test('role schemas enforce the SPEC-10 section split', () => {
  const client = getContractRoleSchema('rent-contract-v1', 'client');
  const user = getContractRoleSchema('rent-contract-v1', 'user');

  assert.deepEqual(client.sections.map((section) => section.title), ['Inquilino', 'Garantes']);
  assert.deepEqual(user.sections.map((section) => section.title), ['Propietario', 'Contrato']);
  assert.equal(client.sections.some((section) =>
    section.fields.some((field) => field.name === 'contract_months')), false);
  assert.equal(user.sections.some((section) =>
    section.fields.some((field) => field.name === 'tenant_full_name')), false);
});

test('contract access tokens are HMAC hashed and compared safely', () => {
  const token = 'a'.repeat(43);
  const hash = hashContractAccessToken(token, ENVIRONMENT);
  assert.match(hash, /^v1:[a-f0-9]{64}$/u);
  assert.equal(hash.includes(token), false);
  assert.equal(verifyContractAccessToken(token, hash, ENVIRONMENT), true);
  assert.equal(verifyContractAccessToken('b'.repeat(43), hash, ENVIRONMENT), false);
});

test('hosted create accepts the agent ID with the explicit insecure opt-in', async () => {
  const repository = new MemoryContractRepository();
  const app = createApp(repository, {
    ...ENVIRONMENT,
    NODE_ENV: 'production',
    CONTRACT_ALLOW_INSECURE_AGENT_ID: 'true',
  });
  app.set('trust proxy', 1);

  const created = await request(app)
    .post('/api/contracts/create')
    .set('X-Forwarded-Proto', 'https')
    .set('X-User-Id', 'hosted-agent')
    .send({});

  assert.equal(created.status, 201);
  assert.equal(repository.entry?.createdBy, 'hosted-agent');
});

test('create, both role submissions, admin inspection, token regeneration, and archive', async () => {
  const repository = new MemoryContractRepository();
  const app = createApp(repository);
  const created = await request(app)
    .post('/api/contracts/create')
    .set('X-User-Id', 'agent-001')
    .send({});

  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'open');
  assert.ok(repository.entry);
  const userUrl = new URL(created.body.userUrl as string);
  const clientUrl = new URL(created.body.clientUrl as string);
  const userToken = userUrl.searchParams.get('token');
  const clientToken = clientUrl.searchParams.get('token');
  assert.ok(userToken);
  assert.ok(clientToken);
  assert.equal(repository.entry.userTokenHash.includes(userToken), false);
  assert.equal(repository.entry.clientTokenHash.includes(clientToken), false);

  const invalidClientToken = await request(app)
    .get(`/api/contracts/${created.body.entryId}/schema`)
    .query({ role: 'client', token: 'x'.repeat(43) });
  assert.equal(invalidClientToken.status, 403);

  const ownedUserSchema = await request(app)
    .get(`/api/contracts/${created.body.entryId}/schema`)
    .query({ role: 'user' })
    .set('X-User-Id', 'agent-001');
  assert.equal(ownedUserSchema.status, 200);
  assert.deepEqual(ownedUserSchema.body.sections.map(
    (section: { title: string }) => section.title,
  ), ['Propietario', 'Contrato']);

  const clientSchema = await request(app)
    .get(`/api/contracts/${created.body.entryId}/schema`)
    .query({ role: 'client', token: clientToken });
  assert.equal(clientSchema.status, 200);
  assert.deepEqual(clientSchema.body.sections.map((section: { title: string }) => section.title), [
    'Inquilino', 'Garantes',
  ]);

  const clientFields = validRoleFields('client', created.body.entryId as string);
  const tenants = clientFields.inquilinos as Record<string, unknown>[];
  tenants.push({ ...tenants[0] });
  const clientSubmission = await request(app)
    .post(`/api/contracts/${created.body.entryId}/submit`)
    .query({ role: 'client', token: clientToken })
    .send({ fields: clientFields });
  assert.equal(clientSubmission.status, 200);
  assert.equal(clientSubmission.body.status, 'open');

  const userSubmission = await request(app)
    .post(`/api/contracts/${created.body.entryId}/submit`)
    .query({ role: 'user', token: userToken })
    .send({ fields: validRoleFields('user') });
  assert.equal(userSubmission.status, 200);
  assert.equal(userSubmission.body.status, 'complete');
  assert.equal(repository.entry?.status, 'complete');
  assert.ok(repository.entry?.combinedSubmission);

  const duplicate = await request(app)
    .post(`/api/contracts/${created.body.entryId}/submit`)
    .query({ role: 'user', token: userToken })
    .send({ fields: validRoleFields('user') });
  assert.equal(duplicate.status, 409);

  const list = await request(app).get('/api/contracts/admin/entries')
    .set('X-User-Id', 'agent-001');
  assert.equal(list.body.entries.length, 1);

  const detail = await request(app)
    .get(`/api/contracts/admin/entries/${created.body.entryId}`)
    .set('X-User-Id', 'agent-001');
  assert.equal(detail.status, 200);
  assert.ok(detail.body.userSubmission);
  assert.ok(detail.body.clientSubmission);
  assert.equal(detail.body.clientSubmission.inquilinos.length, 2);
  assert.equal('userTokenHash' in detail.body.entry, false);

  const regenerated = await request(app)
    .post(`/api/contracts/admin/entries/${created.body.entryId}/tokens/client/regenerate`)
    .set('X-User-Id', 'agent-001')
    .send({});
  assert.equal(regenerated.status, 200);
  assert.notEqual(new URL(regenerated.body.url as string).searchParams.get('token'), clientToken);

  const archived = await request(app)
    .post(`/api/contracts/admin/entries/${created.body.entryId}/archive`)
    .set('X-User-Id', 'agent-001')
    .send({});
  assert.equal(archived.status, 200);
  assert.equal(archived.body.entry.status, 'archived');

  const closed = await request(app)
    .get(`/api/contracts/${created.body.entryId}/schema`)
    .query({ role: 'user', token: userToken });
  assert.equal(closed.status, 410);
});
