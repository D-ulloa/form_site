import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { getContractRoleSchema } from '../src/config/contractSchemas.js';
import type {
  ContractDniImageReference,
  ContractEntryRecord,
  ContractFieldDefinition,
  ContractFieldValue,
  ContractRole,
} from '../src/contracts/types.js';
import { createContractEntriesRouter } from '../src/routes/contractEntries.js';
import type { ContractEntryRepository } from '../src/services/contractEntryRepository.js';
import {
  computeContractFormattedStart,
  computeContractFormattedUpdate,
} from '../src/services/contractComputedDates.js';
import { hashContractAccessToken } from '../src/services/contractTokenService.js';
import { validateContractRoleSubmissionFields } from '../src/services/validateContractRoleSubmission.js';

const ENTRY_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'client-token-that-is-long-and-random-enough-123';
const ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  CONTRACT_TOKEN_SECRET: 'spec-11-test-secret-that-is-at-least-32-chars',
  CONTRACT_DNI_STORAGE_BUCKET: 'contract-dni',
};

function entry(): ContractEntryRecord {
  return {
    id: ENTRY_ID,
    schemaId: 'rent-contract-v1',
    createdBy: 'agent-001',
    createdAt: '2026-07-27T12:00:00.000Z',
    userTokenHash: hashContractAccessToken('user-token-that-is-long-and-random-enough-123', ENVIRONMENT),
    clientTokenHash: hashContractAccessToken(TOKEN, ENVIRONMENT),
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
}

function valueFor(field: ContractFieldDefinition): ContractFieldValue {
  if (field.type === 'email') return `${field.name}@example.test`;
  if (field.type === 'number') return field.min ?? 1;
  if (field.type === 'date') return '2026-08-15';
  if (field.type === 'boolean') return false;
  if (field.type === 'select') return field.options?.[0] ?? '';
  return `${field.name} value`;
}

function requiredFields(fields: readonly ContractFieldDefinition[]): Record<string, ContractFieldValue> {
  return Object.fromEntries(fields
    .filter((field) => field.required && !field.computed)
    .map((field) => [field.name, valueFor(field)]));
}

function validClientFields(): Record<string, unknown> {
  const schema = getContractRoleSchema('rent-contract-v1', 'client');
  return Object.fromEntries(schema.sections.map((section) => [
    section.repeatable?.name ?? section.title,
    [requiredFields(section.fields)],
  ]));
}

function validUserFields(): Record<string, unknown> {
  const schema = getContractRoleSchema('rent-contract-v1', 'user');
  return {
    ...Object.fromEntries(schema.sections.flatMap((section) =>
      Object.entries(requiredFields(section.fields)))),
    contract_start_date: '2026-08-15',
    contract_update: 6,
    contract_selection: 'IPC',
  };
}

function imageReference(
  collection: 'inquilinos' | 'garantes',
  slot: 'front' | 'back',
): ContractDniImageReference {
  const storagePath = `contracts/${ENTRY_ID}/client/${collection}/0/`
    + `${slot}-22222222-2222-4222-8222-222222222222-image.jpg`;
  return {
    originalName: `${slot}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    storagePath,
    storageBucket: 'contract-dni',
    publicPath: `contract-dni/${storagePath}`,
    slot,
  };
}

test('SPEC-11 role schema exposes repeatable client sections and revised contract fields', () => {
  const client = getContractRoleSchema('rent-contract-v1', 'client');
  const user = getContractRoleSchema('rent-contract-v1', 'user');

  assert.deepEqual(client.sections.map((section) => section.repeatable?.name), [
    'inquilinos',
    'garantes',
  ]);
  assert.deepEqual(client.sections.map((section) => section.uploads?.map((upload) => upload.slot)), [
    ['front', 'back'],
    ['front', 'back'],
  ]);

  const contractFields = user.sections.find((section) => section.title === 'Contrato')?.fields ?? [];
  assert.equal(contractFields.some((field) => field.name === 'approve_contract'), false);
  assert.deepEqual(
    contractFields.find((field) => field.name === 'contract_selection')?.options,
    ['IPC', 'IPL'],
  );
  assert.equal(contractFields.find((field) => field.name === 'contract_formatted_start')?.readOnly, true);
  assert.equal(contractFields.find((field) => field.name === 'contract_formatted_update')?.readOnly, true);
});

test('computed contract dates handle month ends, leap years, zero, and absent updates', () => {
  assert.equal(computeContractFormattedStart('2026-08-15'), '2026-07-31');
  assert.equal(computeContractFormattedStart('2028-03-01'), '2028-02-29');
  assert.equal(computeContractFormattedStart('2027-03-01'), '2027-02-28');
  assert.equal(computeContractFormattedUpdate('2026-07-31', 6), '2027-01-31');
  assert.equal(computeContractFormattedUpdate('2026-07-31', 0), '2026-07-31');
  assert.equal(computeContractFormattedUpdate('2026-07-31', null), null);
});

test('user submissions overwrite computed dates and reject approval or invalid Ajuste values', () => {
  const roleSchema = getContractRoleSchema('rent-contract-v1', 'user');
  const fields = {
    ...validUserFields(),
    contract_formatted_start: '1999-01-01',
    contract_formatted_update: '1999-02-01',
  };
  const validation = validateContractRoleSubmissionFields({
    entry: entry(),
    role: 'user',
    roleSchema,
    fields,
  }, ENVIRONMENT);
  assert.equal(validation.success, true);
  if (validation.success) {
    assert.equal(validation.fields.contract_formatted_start, '2026-07-31');
    assert.equal(validation.fields.contract_formatted_update, '2027-01-31');
  }

  for (const invalidFields of [
    { ...validUserFields(), approve_contract: 'Sí' },
    { ...validUserFields(), contract_selection: 'Otro' },
    { ...validUserFields(), contract_update: 1.5 },
  ]) {
    const invalid = validateContractRoleSubmissionFields({
      entry: entry(), role: 'user', roleSchema, fields: invalidFields,
    }, ENVIRONMENT);
    assert.equal(invalid.success, false);
  }
});

test('client validation accepts multiple records and only complete front/back image pairs', () => {
  const roleSchema = getContractRoleSchema('rent-contract-v1', 'client');
  const fields = validClientFields();
  const tenants = fields.inquilinos as Record<string, unknown>[];
  tenants.push({ ...tenants[0] });
  tenants[0] = {
    ...tenants[0],
    tenant_dni_front_image: imageReference('inquilinos', 'front'),
    tenant_dni_back_image: imageReference('inquilinos', 'back'),
  };
  const validation = validateContractRoleSubmissionFields({
    entry: entry(), role: 'client', roleSchema, fields,
  }, ENVIRONMENT);
  assert.equal(validation.success, true);

  const incompleteFields = validClientFields();
  const incompleteTenants = incompleteFields.inquilinos as Record<string, unknown>[];
  incompleteTenants[0] = {
    ...incompleteTenants[0],
    tenant_dni_front_image: imageReference('inquilinos', 'front'),
  };
  const incomplete = validateContractRoleSubmissionFields({
    entry: entry(), role: 'client', roleSchema, fields: incompleteFields,
  }, ENVIRONMENT);
  assert.equal(incomplete.success, false);

  const wrongTypeFields = validClientFields();
  const wrongTypeTenants = wrongTypeFields.inquilinos as Record<string, unknown>[];
  wrongTypeTenants[0] = {
    ...wrongTypeTenants[0],
    tenant_dni_front_image: {
      ...imageReference('inquilinos', 'front'),
      mimeType: 'video/mp4',
    },
    tenant_dni_back_image: imageReference('inquilinos', 'back'),
  };
  const wrongType = validateContractRoleSubmissionFields({
    entry: entry(), role: 'client', roleSchema, fields: wrongTypeFields,
  }, ENVIRONMENT);
  assert.equal(wrongType.success, false);

  const wrongEntryFields = validClientFields();
  const wrongEntryTenants = wrongEntryFields.inquilinos as Record<string, unknown>[];
  const wrongEntryFront = imageReference('inquilinos', 'front');
  const wrongEntryPath = wrongEntryFront.storagePath.replace(
    ENTRY_ID,
    '33333333-3333-4333-8333-333333333333',
  );
  wrongEntryTenants[0] = {
    ...wrongEntryTenants[0],
    tenant_dni_front_image: {
      ...wrongEntryFront,
      storagePath: wrongEntryPath,
      publicPath: `contract-dni/${wrongEntryPath}`,
    },
    tenant_dni_back_image: imageReference('inquilinos', 'back'),
  };
  const wrongEntry = validateContractRoleSubmissionFields({
    entry: entry(), role: 'client', roleSchema, fields: wrongEntryFields,
  }, ENVIRONMENT);
  assert.equal(wrongEntry.success, false);
});

test('DNI presign route requires the matching client token and forwards validated descriptors', async () => {
  const currentEntry = entry();
  const repository: ContractEntryRepository = {
    async findEntry(id) { return id === ENTRY_ID ? currentEntry : null; },
    async createEntry() { throw new Error('not used'); },
    async listEntries() { return []; },
    async saveRoleSubmission() { throw new Error('not used'); },
    async archiveEntry() { throw new Error('not used'); },
    async replaceTokenHash() { throw new Error('not used'); },
  };
  let received: readonly { readonly slot: string }[] = [];
  const app = express();
  app.use(express.json());
  app.use('/api/contracts', createContractEntriesRouter({
    environment: ENVIRONMENT,
    repository,
    rateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    now: () => new Date('2026-07-27T12:00:00.000Z'),
    issueDniUploadUrls: async (_entryId, descriptors) => {
      received = descriptors;
      return [{ ...imageReference('inquilinos', 'front'), uploadUrl: 'https://upload.example.test' }];
    },
  }));
  const body = {
    uploads: [{
      collection: 'inquilinos',
      itemIndex: 0,
      slot: 'front',
      originalName: 'front.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
    }],
  };

  const missing = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/dni-uploads/presign`)
    .send(body);
  assert.equal(missing.status, 401);

  const accepted = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/dni-uploads/presign`)
    .query({ token: TOKEN })
    .send(body);
  assert.equal(accepted.status, 200);
  assert.equal(received[0]?.slot, 'front');
  assert.equal(accepted.body.uploads[0].storageBucket, 'contract-dni');

  const oversized = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/dni-uploads/presign`)
    .query({ token: TOKEN })
    .send({
      uploads: [{ ...body.uploads[0], sizeBytes: (10 * 1024 * 1024) + 1 }],
    });
  assert.equal(oversized.status, 400);
  assert.equal(oversized.body.error, 'INVALID_DNI_UPLOAD');
});
