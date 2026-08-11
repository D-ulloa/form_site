import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import express from 'express';
import request from 'supertest';
import { getContractRoleSchema } from '../../src/config/contractSchemas.js';
import type {
  ContractEntryRecord,
  ContractEvidenceFileField,
  ContractEvidenceFileReference,
  ContractFieldDefinition,
  ContractFieldValue,
  ContractSubmissionRecord,
} from '../../src/contracts/types.js';
import { createContractEntriesRouter } from '../../src/routes/contractEntries.js';
import { buildContractAdminInspection } from '../../src/services/contractAdminInspectionService.js';
import type {
  ContractEntryRepository,
  SaveContractRoleSubmissionInput,
} from '../../src/services/contractEntryRepository.js';
import {
  CONTRACT_EVIDENCE_FILE_MIME_TYPES,
  ContractEvidenceUploadValidationError,
  ContractEvidenceVerificationUnavailableError,
  issueContractEvidenceUploadUrls,
  issueContractEvidenceViewUrl,
  sanitizeContractEvidenceFileName,
  verifyContractEvidenceReferences,
} from '../../src/services/contractEvidenceUploadService.js';
import {
  ContractRoleValidationError,
  submitContractEntryRole,
} from '../../src/services/contractEntryService.js';
import { createContractSubmissionRateLimiter } from '../../src/services/contractSubmissionRateLimiter.js';
import { hashContractAccessToken } from '../../src/services/contractTokenService.js';
import { validateContractRoleSubmissionFields } from '../../src/services/validateContractRoleSubmission.js';

const ENTRY_ID = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_TOKEN = 'client-token-that-is-long-and-random-enough-spec-14';
const ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  CONTRACT_TOKEN_SECRET: 'spec-14-test-secret-that-is-at-least-32-chars',
  CONTRACT_EVIDENCE_STORAGE_BUCKET: 'contract-evidence',
  CONTRACT_EVIDENCE_MAX_FILE_BYTES: String(10 * 1024 * 1024),
};

function entry(overrides: Partial<ContractEntryRecord> = {}): ContractEntryRecord {
  return {
    id: ENTRY_ID,
    schemaId: 'rent-contract-v1',
    createdBy: 'agent-001',
    createdAt: '2026-07-29T12:00:00.000Z',
    userTokenHash: hashContractAccessToken(
      'user-token-that-is-long-and-random-enough-spec-14',
      ENVIRONMENT,
    ),
    clientTokenHash: hashContractAccessToken(CLIENT_TOKEN, ENVIRONMENT),
    userFilled: false,
    clientFilled: false,
    userSubmittedAt: null,
    clientSubmittedAt: null,
    userSubmission: null,
    clientSubmission: null,
    combinedSubmission: null,
    status: 'open',
    archivedAt: null,
    ...overrides,
  };
}

function valueFor(field: ContractFieldDefinition): ContractFieldValue {
  if (field.type === 'email') return `${field.name}@example.test`;
  if (field.type === 'number') return field.min ?? 1;
  if (field.type === 'date') return '2026-08-01';
  if (field.type === 'boolean') return false;
  if (field.type === 'select') return field.options?.[0] ?? '';
  return `${field.name} value`;
}

function requiredFields(
  fields: readonly ContractFieldDefinition[],
): Record<string, ContractFieldValue> {
  return Object.fromEntries(fields
    .filter((field) => field.required && !field.computed)
    .map((field) => [field.name, valueFor(field)]));
}

function evidenceReference(
  field: ContractEvidenceFileField,
  options: {
    readonly itemIndex?: number;
    readonly filename?: string;
    readonly mimeType?: string;
    readonly size?: number;
    readonly entryId?: string;
    readonly storageBucket?: string;
  } = {},
): ContractEvidenceFileReference {
  const itemIndex = options.itemIndex ?? 0;
  const filename = options.filename ?? (
    options.mimeType === 'application/pdf' ? 'archivo.pdf' : 'archivo.jpg'
  );
  const referenceEntryId = options.entryId ?? ENTRY_ID;
  return {
    filename,
    mimeType: options.mimeType ?? 'image/jpeg',
    size: options.size ?? 2048,
    storagePath: [
      'contracts',
      referenceEntryId,
      'client',
      'garantes',
      String(itemIndex),
      field,
      `${FILE_ID}-${sanitizeContractEvidenceFileName(filename)}`,
    ].join('/'),
    storageBucket: options.storageBucket ?? 'contract-evidence',
  };
}

function validClientFields(
  guarantorOverrides: readonly Readonly<Record<string, unknown>>[] = [{
    guarantor_company: 'Empresa SA',
    recibo_sueldo_files: [evidenceReference('recibo_sueldo_files')],
  }],
): Record<string, unknown> {
  const schema = getContractRoleSchema('rent-contract-v1', 'client', ENVIRONMENT);
  const tenant = schema.sections.find(
    (section) => section.repeatable?.name === 'inquilinos',
  );
  const guarantor = schema.sections.find(
    (section) => section.repeatable?.name === 'garantes',
  );
  assert.ok(tenant);
  assert.ok(guarantor);
  return {
    inquilinos: [requiredFields(tenant.fields)],
    garantes: guarantorOverrides.map((overrides) => ({
      ...requiredFields(guarantor.fields),
      ...overrides,
    })),
  };
}

function validate(fields: Readonly<Record<string, unknown>>) {
  return validateContractRoleSubmissionFields({
    entry: entry(),
    role: 'client',
    roleSchema: getContractRoleSchema('rent-contract-v1', 'client', ENVIRONMENT),
    fields,
  }, ENVIRONMENT);
}

test('SPEC-14 schema exposes one exact receiver under each guarantor subsection', () => {
  const maxSizeBytes = 7 * 1024 * 1024;
  const schema = getContractRoleSchema('rent-contract-v1', 'client', {
    ...ENVIRONMENT,
    CONTRACT_EVIDENCE_MAX_FILE_BYTES: String(maxSizeBytes),
  });
  const guarantors = schema.sections.find(
    (section) => section.repeatable?.name === 'garantes',
  );

  assert.deepEqual(guarantors?.subsections?.map((subsection) => ({
    title: subsection.title,
    fileReceivers: subsection.fileReceivers,
  })), [
    {
      title: 'Recibo de sueldo',
      fileReceivers: [{
        name: 'recibo_sueldo_files',
        label: 'Subir recibo de sueldo',
        maxFiles: 2,
        maxSizeBytes,
        acceptedMimeTypes: CONTRACT_EVIDENCE_FILE_MIME_TYPES,
      }],
    },
    {
      title: 'Garantía propietaria',
      fileReceivers: [{
        name: 'garantia_propietaria_files',
        label: 'Subir garantía propietaria',
        maxFiles: 2,
        maxSizeBytes,
        acceptedMimeTypes: CONTRACT_EVIDENCE_FILE_MIME_TYPES,
      }],
    },
  ]);
});

test('SPEC-14 validation accepts every listed MIME and persists stable reference arrays', () => {
  for (const mimeType of CONTRACT_EVIDENCE_FILE_MIME_TYPES) {
    const field = mimeType === 'application/pdf'
      ? 'garantia_propietaria_files'
      : 'recibo_sueldo_files';
    const fields = validClientFields([{
      guarantor_company: 'Empresa SA',
      [field]: [evidenceReference(field, {
        mimeType,
        filename: mimeType === 'application/pdf' ? 'garantia.pdf' : 'imagen.bin',
      })],
    }]);
    const result = validate(fields);
    assert.equal(result.success, true, `expected ${mimeType} to be accepted`);
    if (result.success) {
      const storedGuarantor = (result.fields.garantes as Record<string, unknown>[])[0];
      assert.ok(storedGuarantor);
      assert.deepEqual(storedGuarantor[field], (
        fields.garantes as Record<string, unknown>[]
      )[0]?.[field]);
      assert.deepEqual(
        storedGuarantor[field === 'recibo_sueldo_files'
          ? 'garantia_propietaria_files'
          : 'recibo_sueldo_files'],
        [],
      );
    }
  }

  const both = validate(validClientFields([{
    guarantor_company: 'Empresa SA',
    recibo_sueldo_files: [
      evidenceReference('recibo_sueldo_files'),
      evidenceReference('recibo_sueldo_files', { filename: 'segundo.png', mimeType: 'image/png' }),
    ],
    garantia_propietaria_files: [
      evidenceReference('garantia_propietaria_files', {
        filename: 'titulo.pdf',
        mimeType: 'application/pdf',
      }),
    ],
  }]));
  assert.equal(both.success, true);

  const unicodeFilename = validate(validClientFields([{
    guarantor_company: 'Empresa SA',
    garantia_propietaria_files: [evidenceReference('garantia_propietaria_files', {
      filename: 'Título de propiedad Nº 1.pdf',
      mimeType: 'application/pdf',
    })],
  }]));
  assert.equal(unicodeFilename.success, true);
});

test('SPEC-14 validation enforces each receiver and each repeated guarantor independently', () => {
  const invalidCases: readonly {
    readonly fields: Readonly<Record<string, unknown>>;
    readonly path: string;
  }[] = [
    {
      fields: validClientFields([{ guarantor_company: 'Empresa SA' }]),
      path: 'fields.garantes.0._files',
    },
    {
      fields: validClientFields([{
        guarantor_company: 'Empresa SA',
        recibo_sueldo_files: [
          evidenceReference('recibo_sueldo_files'),
          evidenceReference('recibo_sueldo_files', { filename: 'dos.jpg' }),
          evidenceReference('recibo_sueldo_files', { filename: 'tres.jpg' }),
        ],
      }]),
      path: 'fields.garantes.0.recibo_sueldo_files',
    },
    {
      fields: validClientFields([{
        guarantor_company: 'Empresa SA',
        recibo_sueldo_files: [evidenceReference('recibo_sueldo_files', {
          mimeType: 'image/svg+xml',
        })],
      }]),
      path: 'fields.garantes.0.recibo_sueldo_files.0',
    },
    {
      fields: validClientFields([{
        guarantor_company: 'Empresa SA',
        recibo_sueldo_files: [evidenceReference('recibo_sueldo_files', {
          size: (10 * 1024 * 1024) + 1,
        })],
      }]),
      path: 'fields.garantes.0.recibo_sueldo_files.0',
    },
    {
      fields: validClientFields([{
        guarantor_company: 'Empresa SA',
        recibo_sueldo_files: [evidenceReference('recibo_sueldo_files', {
          storageBucket: 'attacker-bucket',
        })],
      }]),
      path: 'fields.garantes.0.recibo_sueldo_files.0',
    },
    {
      fields: validClientFields([{
        guarantor_company: 'Empresa SA',
        recibo_sueldo_files: [evidenceReference('recibo_sueldo_files', {
          entryId: '33333333-3333-4333-8333-333333333333',
        })],
      }]),
      path: 'fields.garantes.0.recibo_sueldo_files.0',
    },
    {
      fields: validClientFields([{
        guarantor_company: 'Empresa SA',
        recibo_sueldo_files: [{
          ...evidenceReference('recibo_sueldo_files', {
            filename: 'Nómina julio.pdf',
            mimeType: 'application/pdf',
          }),
          filename: 'otro-archivo.pdf',
        }],
      }]),
      path: 'fields.garantes.0.recibo_sueldo_files.0',
    },
    {
      fields: validClientFields([{
        guarantor_company: 'Empresa SA',
        recibo_sueldo_files: [{
          ...evidenceReference('recibo_sueldo_files'),
          uploadUrl: 'https://storage.example.test/temporary',
        }],
      }]),
      path: 'fields.garantes.0.recibo_sueldo_files.0',
    },
  ];

  for (const invalidCase of invalidCases) {
    const result = validate(invalidCase.fields);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(
        result.errors.some((error) => error.path === invalidCase.path),
        `expected an error at ${invalidCase.path}`,
      );
    }
  }

  const secondGuarantorMissing = validate(validClientFields([
    {
      guarantor_company: 'Empresa Uno',
      recibo_sueldo_files: [evidenceReference('recibo_sueldo_files')],
    },
    { guarantor_company: 'Empresa Dos' },
  ]));
  assert.equal(secondGuarantorMissing.success, false);
  if (!secondGuarantorMissing.success) {
    assert.ok(secondGuarantorMissing.errors.some(
      (error) => error.path === 'fields.garantes.1._files',
    ));
  }

  const evidenceDoesNotReplaceSpec12ScalarData = validate(validClientFields([{
    recibo_sueldo_files: [evidenceReference('recibo_sueldo_files')],
  }]));
  assert.equal(evidenceDoesNotReplaceSpec12ScalarData.success, false);
  if (!evidenceDoesNotReplaceSpec12ScalarData.success) {
    assert.ok(evidenceDoesNotReplaceSpec12ScalarData.errors.some(
      (error) => error.path === 'fields.garantes.0._subsections',
    ));
  }
});

test('SPEC-14 evidence presigning requires the client token and validates batch limits', async () => {
  const currentEntry = entry();
  const repository: ContractEntryRepository = {
    async findEntry(id) { return id === ENTRY_ID ? currentEntry : null; },
    async createEntry() { throw new Error('not used'); },
    async listEntries() { return []; },
    async listSubmissions() { return []; },
    async saveRoleSubmission() { throw new Error('not used'); },
    async archiveEntry() { throw new Error('not used'); },
    async replaceTokenHash() { throw new Error('not used'); },
  };
  let captured: readonly {
    readonly field: ContractEvidenceFileField;
    readonly mimeType: string;
  }[] = [];
  const rateLimitKeys: string[] = [];
  const app = express();
  app.use(express.json());
  app.use('/api/contracts', createContractEntriesRouter({
    environment: ENVIRONMENT,
    repository,
    rateLimiter: {
      check(key) {
        rateLimitKeys.push(key);
        return { allowed: true, retryAfterSeconds: 0 };
      },
    },
    issueEvidenceUploadUrls: async (_entryId, descriptors) => {
      captured = descriptors;
      return descriptors.map((descriptor) => ({
        filename: descriptor.filename,
        mimeType: descriptor.mimeType,
        size: descriptor.size,
        storagePath: evidenceReference(descriptor.field).storagePath,
        storageBucket: 'contract-evidence',
        uploadUrl: 'https://storage.example.test/upload',
      }));
    },
  }));
  const descriptor = {
    collection: 'garantes',
    itemIndex: 0,
    field: 'garantia_propietaria_files',
    filename: 'titulo.pdf',
    mimeType: 'application/pdf',
    size: 4096,
  };

  const missingToken = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/evidence-uploads/presign`)
    .send({ uploads: [descriptor] });
  assert.equal(missingToken.status, 401);
  assert.equal(rateLimitKeys.length, 0);

  const accepted = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/evidence-uploads/presign`)
    .query({ token: CLIENT_TOKEN })
    .send({ uploads: [descriptor] });
  assert.equal(accepted.status, 200);
  assert.match(rateLimitKeys[0] ?? '', new RegExp(`^evidence:.*:${ENTRY_ID}$`, 'u'));
  assert.equal(captured[0]?.field, 'garantia_propietaria_files');
  assert.equal(captured[0]?.mimeType, 'application/pdf');
  assert.deepEqual(Object.keys(accepted.body.uploads[0]).sort(), [
    'filename',
    'mimeType',
    'size',
    'storageBucket',
    'storagePath',
    'uploadUrl',
  ]);

  const oversized = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/evidence-uploads/presign`)
    .query({ token: CLIENT_TOKEN })
    .send({
      uploads: [{ ...descriptor, size: (10 * 1024 * 1024) + 1 }],
    });
  assert.equal(oversized.status, 400);
  assert.equal(oversized.body.error, 'INVALID_EVIDENCE_UPLOAD');

  const tooMany = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/evidence-uploads/presign`)
    .query({ token: CLIENT_TOKEN })
    .send({ uploads: [descriptor, descriptor, descriptor] });
  assert.equal(tooMany.status, 400);
  assert.equal(tooMany.body.error, 'INVALID_REQUEST');

  const wrongType = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/evidence-uploads/presign`)
    .query({ token: CLIENT_TOKEN })
    .send({ uploads: [{ ...descriptor, mimeType: 'text/plain' }] });
  assert.equal(wrongType.status, 400);
  assert.equal(wrongType.body.error, 'INVALID_REQUEST');

  let issuedWhileLimited = false;
  const limitedApp = express();
  limitedApp.use(express.json());
  limitedApp.use('/api/contracts', createContractEntriesRouter({
    environment: ENVIRONMENT,
    repository,
    rateLimiter: {
      check: () => ({ allowed: false, retryAfterSeconds: 37 }),
    },
    issueEvidenceUploadUrls: async () => {
      issuedWhileLimited = true;
      return [];
    },
  }));
  const limited = await request(limitedApp)
    .post(`/api/contracts/${ENTRY_ID}/evidence-uploads/presign`)
    .query({ token: CLIENT_TOKEN })
    .send({ uploads: [descriptor] });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['retry-after'], '37');
  assert.equal(limited.body.error, 'RATE_LIMITED');
  assert.equal(limited.body.retriable, true);
  assert.equal(issuedWhileLimited, false);
});

test('SPEC-14 evidence presigning rate-limits the eleventh request in its own namespace', async () => {
  const currentEntry = entry();
  const repository: ContractEntryRepository = {
    async findEntry(id) { return id === ENTRY_ID ? currentEntry : null; },
    async createEntry() { throw new Error('not used'); },
    async listEntries() { return []; },
    async listSubmissions() { return []; },
    async saveRoleSubmission() { throw new Error('not used'); },
    async archiveEntry() { throw new Error('not used'); },
    async replaceTokenHash() { throw new Error('not used'); },
  };
  const limiter = createContractSubmissionRateLimiter({
    ...ENVIRONMENT,
    CONTRACT_SUBMISSION_RATE_LIMIT: '10',
    CONTRACT_SUBMISSION_RATE_WINDOW_MS: '900000',
  }, () => Date.parse('2026-07-29T12:00:00.000Z'));
  const checkedKeys: string[] = [];
  let issued = 0;
  const app = express();
  app.use(express.json());
  app.use('/api/contracts', createContractEntriesRouter({
    environment: ENVIRONMENT,
    repository,
    rateLimiter: {
      check(key) {
        checkedKeys.push(key);
        return limiter.check(key);
      },
    },
    issueEvidenceUploadUrls: async (_entryId, descriptors) => {
      issued += 1;
      return descriptors.map((descriptor) => ({
        ...evidenceReference(descriptor.field, {
          itemIndex: descriptor.itemIndex,
          filename: descriptor.filename,
          mimeType: descriptor.mimeType,
          size: descriptor.size,
        }),
        uploadUrl: 'https://storage.example.test/upload',
      }));
    },
  }));
  const descriptor = {
    collection: 'garantes',
    itemIndex: 0,
    field: 'recibo_sueldo_files',
    filename: 'recibo.pdf',
    mimeType: 'application/pdf',
    size: 4096,
  };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const accepted = await request(app)
      .post(`/api/contracts/${ENTRY_ID}/evidence-uploads/presign`)
      .query({ token: CLIENT_TOKEN })
      .send({ uploads: [descriptor] });
    assert.equal(accepted.status, 200);
  }
  const limited = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/evidence-uploads/presign`)
    .query({ token: CLIENT_TOKEN })
    .send({ uploads: [descriptor] });
  assert.equal(limited.status, 429);
  assert.equal(issued, 10);
  assert.equal(checkedKeys.length, 11);
  assert.ok(checkedKeys.every((key) => key.startsWith('evidence:')));

  const evidenceKey = checkedKeys[0];
  assert.ok(evidenceKey);
  const submissionKey = evidenceKey.slice('evidence:'.length);
  assert.equal(limiter.check(submissionKey).allowed, true);
});

test('SPEC-14 storage service creates entry-scoped paths and short-lived private views', async () => {
  const uploadCalls: { bucket?: string; path?: string; upsert?: boolean } = {};
  const uploadClient = {
    storage: {
      from(bucket: string) {
        uploadCalls.bucket = bucket;
        return {
          async createSignedUploadUrl(path: string, options: { upsert: boolean }) {
            uploadCalls.path = path;
            uploadCalls.upsert = options.upsert;
            return {
              data: { path, signedUrl: 'https://storage.example.test/upload-token' },
              error: null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  const uploads = await issueContractEvidenceUploadUrls(
    ENTRY_ID,
    [{
      collection: 'garantes',
      itemIndex: 2,
      field: 'recibo_sueldo_files',
      filename: '../Nómina julio.pdf',
      mimeType: 'application/pdf',
      size: 4096,
    }],
    ENVIRONMENT,
    uploadClient,
  );
  assert.equal(uploadCalls.bucket, 'contract-evidence');
  assert.equal(uploadCalls.upsert, false);
  assert.match(
    uploadCalls.path ?? '',
    new RegExp(
      `^contracts/${ENTRY_ID}/client/garantes/2/recibo_sueldo_files/`
        + '[0-9a-f-]+-Nomina_julio\\.pdf$',
      'u',
    ),
  );
  assert.equal(uploads[0]?.uploadUrl, 'https://storage.example.test/upload-token');
  assert.equal('uploadUrl' in (uploads[0] ?? {}), true);

  const viewCalls: { bucket?: string; path?: string; ttl?: number } = {};
  const viewClient = {
    storage: {
      from(bucket: string) {
        viewCalls.bucket = bucket;
        return {
          async createSignedUrl(path: string, ttl: number) {
            viewCalls.path = path;
            viewCalls.ttl = ttl;
            return {
              data: { signedUrl: 'https://storage.example.test/view-token' },
              error: null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  const reference = evidenceReference('garantia_propietaria_files', {
    filename: 'titulo.pdf',
    mimeType: 'application/pdf',
  });
  const view = await issueContractEvidenceViewUrl(
    reference,
    ENVIRONMENT,
    viewClient,
    () => new Date('2026-07-29T12:00:00.000Z'),
  );
  assert.deepEqual(viewCalls, {
    bucket: 'contract-evidence',
    path: reference.storagePath,
    ttl: 600,
  });
  assert.deepEqual(view, {
    viewUrl: 'https://storage.example.test/view-token',
    expiresAt: '2026-07-29T12:10:00.000Z',
  });
  await assert.rejects(
    issueContractEvidenceViewUrl(
      { ...reference, storageBucket: 'attacker-bucket' },
      ENVIRONMENT,
      viewClient,
    ),
    ContractEvidenceUploadValidationError,
  );
});

test('SPEC-14 verifies private object existence, size, and MIME metadata', async () => {
  const salary = evidenceReference('recibo_sueldo_files', {
    filename: 'Nómina julio.pdf',
    mimeType: 'application/pdf',
    size: 4096,
  });
  const property = evidenceReference('garantia_propietaria_files', {
    filename: 'titulo.png',
    mimeType: 'image/png',
    size: 2048,
  });
  const storedObjects = new Map([
    [salary.storagePath, { size: salary.size, contentType: salary.mimeType }],
    [property.storagePath, { size: property.size, contentType: property.mimeType }],
  ]);
  const inspected: { bucket: string; path: string }[] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          async info(path: string) {
            inspected.push({ bucket, path });
            const object = storedObjects.get(path);
            return object
              ? {
                  data: {
                    id: 'object-id',
                    version: 'version',
                    name: path,
                    bucketId: bucket,
                    createdAt: '2026-07-29T12:00:00.000Z',
                    ...object,
                  },
                  error: null,
                }
              : {
                  data: null,
                  error: { status: 404, message: 'Object not found' },
                };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  const validTargets = [
    {
      path: 'fields.garantes.0.recibo_sueldo_files.0',
      reference: salary,
    },
    {
      path: 'fields.garantes.0.garantia_propietaria_files.0',
      reference: property,
    },
  ];
  const valid = await verifyContractEvidenceReferences(
    validTargets,
    ENVIRONMENT,
    client,
  );
  assert.deepEqual(valid, []);
  assert.deepEqual(inspected, [
    { bucket: 'contract-evidence', path: salary.storagePath },
    { bucket: 'contract-evidence', path: property.storagePath },
  ]);

  inspected.length = 0;
  const duplicate = await verifyContractEvidenceReferences([
    validTargets[0]!,
    {
      path: 'fields.garantes.0.recibo_sueldo_files.1',
      reference: { ...salary },
    },
  ], ENVIRONMENT, client);
  assert.deepEqual(duplicate.map((error) => error.path), [
    'fields.garantes.0.recibo_sueldo_files.1',
  ]);
  assert.deepEqual(inspected, [
    { bucket: 'contract-evidence', path: salary.storagePath },
  ]);

  const missing = evidenceReference('recibo_sueldo_files', {
    filename: 'faltante.pdf',
    mimeType: 'application/pdf',
  });
  const missingResult = await verifyContractEvidenceReferences([{
    path: 'fields.garantes.1.recibo_sueldo_files.0',
    reference: missing,
  }], ENVIRONMENT, client);
  assert.deepEqual(missingResult.map((error) => error.path), [
    'fields.garantes.1.recibo_sueldo_files.0',
  ]);

  const mismatchedMetadata = await verifyContractEvidenceReferences([
    {
      path: 'fields.garantes.0.recibo_sueldo_files.0',
      reference: { ...salary, size: salary.size + 1 },
    },
    {
      path: 'fields.garantes.0.garantia_propietaria_files.0',
      reference: { ...property, mimeType: 'image/jpeg' },
    },
  ], ENVIRONMENT, client);
  assert.deepEqual(mismatchedMetadata.map((error) => error.path), [
    'fields.garantes.0.recibo_sueldo_files.0',
    'fields.garantes.0.garantia_propietaria_files.0',
  ]);

  const unavailableClient = {
    storage: {
      from() {
        return {
          async info() {
            return {
              data: null,
              error: { status: 503, message: 'Storage unavailable' },
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  await assert.rejects(
    verifyContractEvidenceReferences(
      [validTargets[0]!],
      ENVIRONMENT,
      unavailableClient,
    ),
    ContractEvidenceVerificationUnavailableError,
  );

  const incompleteMetadataClient = {
    storage: {
      from(bucket: string) {
        return {
          async info(path: string) {
            return {
              data: {
                id: 'object-id',
                version: 'version',
                name: path,
                bucketId: bucket,
                createdAt: '2026-07-29T12:00:00.000Z',
              },
              error: null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  await assert.rejects(
    verifyContractEvidenceReferences(
      [validTargets[0]!],
      ENVIRONMENT,
      incompleteMetadataClient,
    ),
    ContractEvidenceVerificationUnavailableError,
  );
});

test('SPEC-14 submit reports Storage verification outages as retriable 503', async () => {
  let saveCalls = 0;
  const repository: ContractEntryRepository = {
    async findEntry(id) { return id === ENTRY_ID ? entry() : null; },
    async createEntry() { throw new Error('not used'); },
    async listEntries() { return []; },
    async listSubmissions() { return []; },
    async saveRoleSubmission() {
      saveCalls += 1;
      throw new Error('must not persist');
    },
    async archiveEntry() { throw new Error('not used'); },
    async replaceTokenHash() { throw new Error('not used'); },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/contracts', createContractEntriesRouter({
    environment: ENVIRONMENT,
    repository,
    rateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    verifyEvidenceReferences: async () => {
      throw new ContractEvidenceVerificationUnavailableError();
    },
  }));

  const response = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/submit`)
    .query({ role: 'client', token: CLIENT_TOKEN })
    .send({ fields: validClientFields() });
  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'EVIDENCE_VERIFICATION_UNAVAILABLE');
  assert.equal(response.body.retriable, true);
  assert.equal(saveCalls, 0);
});

test('SPEC-14 persistence keeps stable refs and admin inspection groups signed media by subsection', async () => {
  const salary = evidenceReference('recibo_sueldo_files', {
    filename: 'recibo.png',
    mimeType: 'image/png',
  });
  const property = evidenceReference('garantia_propietaria_files', {
    filename: 'titulo.pdf',
    mimeType: 'application/pdf',
  });
  const fields = validClientFields([{
    guarantor_company: 'Empresa SA',
    recibo_sueldo_files: [salary],
    garantia_propietaria_files: [property],
  }]);
  let saved: SaveContractRoleSubmissionInput | undefined;
  const repository: ContractEntryRepository = {
    async createEntry() { throw new Error('not used'); },
    async findEntry() { return entry(); },
    async listEntries() { return []; },
    async listSubmissions() { return []; },
    async saveRoleSubmission(input) {
      saved = input;
      return entry({
        clientFilled: true,
        clientSubmission: input.fields,
        clientSubmittedAt: input.submittedAt,
      });
    },
    async archiveEntry() { throw new Error('not used'); },
    async replaceTokenHash() { throw new Error('not used'); },
  };

  const submissionInput = {
    entry: entry(),
    role: 'client' as const,
    authorizedTokenHash: entry().clientTokenHash,
    fields,
    metadata: {
      ip: '127.0.0.1',
      userAgent: 'spec-14-test',
      receivedAt: '2026-07-29T12:05:00.000Z',
    },
  };
  await assert.rejects(
    submitContractEntryRole(submissionInput, repository, {
      environment: ENVIRONMENT,
      verifyEvidenceReferences: async (targets) => [{
        path: targets[0]?.path ?? 'fields.garantes.0.recibo_sueldo_files.0',
        code: 'invalid_type',
        message: 'El archivo no existe.',
      }],
    }),
    ContractRoleValidationError,
  );
  assert.equal(saved, undefined);

  const verifiedPaths: string[] = [];
  await submitContractEntryRole(submissionInput, repository, {
    environment: ENVIRONMENT,
    generateSubmissionId: () => '44444444-4444-4444-8444-444444444444',
    verifyEvidenceReferences: async (targets) => {
      verifiedPaths.push(...targets.map((target) => target.path));
      return [];
    },
  });
  assert.ok(saved);
  assert.deepEqual(verifiedPaths, [
    'fields.garantes.0.recibo_sueldo_files.0',
    'fields.garantes.0.garantia_propietaria_files.0',
  ]);
  const persistedGuarantor = (
    saved.fields.garantes as Record<string, unknown>[]
  )[0];
  assert.deepEqual(persistedGuarantor?.recibo_sueldo_files, [salary]);
  assert.deepEqual(persistedGuarantor?.garantia_propietaria_files, [property]);
  assert.equal(JSON.stringify(saved.fields).includes('uploadUrl'), false);

  const submission: ContractSubmissionRecord = {
    id: '44444444-4444-4444-8444-444444444444',
    entryId: ENTRY_ID,
    role: 'client',
    submission: saved.fields,
    metadata: {
      ip: '127.0.0.1',
      userAgent: 'spec-14-test',
      receivedAt: '2026-07-29T12:05:00.000Z',
    },
    submittedAt: '2026-07-29T12:05:00.000Z',
  };
  const signedPaths: string[] = [];
  const inspection = await buildContractAdminInspection(
    entry({ clientFilled: true, clientSubmission: saved.fields }),
    [submission],
    ENVIRONMENT,
    {
      issueEvidenceViewUrl: async (reference) => {
        signedPaths.push(reference.storagePath);
        return {
          viewUrl: `https://storage.example.test/view/${reference.filename}`,
          expiresAt: '2026-07-29T12:15:00.000Z',
        };
      },
    },
  );
  const guarantorItem = inspection.submissions[0]?.sections.find(
    (section) => section.title === 'Garantes',
  )?.items[0];
  const salarySubsection = guarantorItem?.subsections.find(
    (subsection) => subsection.title === 'Recibo de sueldo',
  );
  const propertySubsection = guarantorItem?.subsections.find(
    (subsection) => subsection.title === 'Garantía propietaria',
  );
  assert.deepEqual(signedPaths, [salary.storagePath, property.storagePath]);
  assert.deepEqual(salarySubsection?.media, [{
    fieldName: 'recibo_sueldo_files',
    label: 'Subir recibo de sueldo',
    filename: 'recibo.png',
    mimeType: 'image/png',
    size: 2048,
    viewUrl: 'https://storage.example.test/view/recibo.png',
    expiresAt: '2026-07-29T12:15:00.000Z',
  }]);
  assert.deepEqual(propertySubsection?.media, [{
    fieldName: 'garantia_propietaria_files',
    label: 'Subir garantía propietaria',
    filename: 'titulo.pdf',
    mimeType: 'application/pdf',
    size: 2048,
    viewUrl: 'https://storage.example.test/view/titulo.pdf',
    expiresAt: '2026-07-29T12:15:00.000Z',
  }]);
  assert.equal(JSON.stringify(guarantorItem?.subsections).includes('storagePath'), false);
  assert.equal(JSON.stringify(guarantorItem?.subsections).includes('storageBucket'), false);
});

test('SPEC-14 admin inspection keeps evidence isolated by guarantor and subsection', async () => {
  const firstSalary = evidenceReference('recibo_sueldo_files', {
    itemIndex: 0,
    filename: 'recibo-uno.pdf',
    mimeType: 'application/pdf',
  });
  const secondProperty = evidenceReference('garantia_propietaria_files', {
    itemIndex: 1,
    filename: 'titulo-dos.png',
    mimeType: 'image/png',
  });
  const fields = validClientFields([
    {
      guarantor_company: 'Empresa Uno',
      recibo_sueldo_files: [firstSalary],
    },
    {
      property_type: 'Casa',
      garantia_propietaria_files: [secondProperty],
    },
  ]);
  const inspection = await buildContractAdminInspection(
    entry({ clientFilled: true, clientSubmission: fields }),
    [{
      id: '55555555-5555-4555-8555-555555555555',
      entryId: ENTRY_ID,
      role: 'client',
      submission: fields,
      metadata: {
        ip: '127.0.0.1',
        userAgent: 'spec-14-isolation-test',
        receivedAt: '2026-07-29T12:20:00.000Z',
      },
      submittedAt: '2026-07-29T12:20:00.000Z',
    }],
    ENVIRONMENT,
    {
      issueEvidenceViewUrl: async (reference) => ({
        viewUrl: `https://storage.example.test/view/${reference.filename}`,
        expiresAt: '2026-07-29T12:30:00.000Z',
      }),
    },
  );
  const items = inspection.submissions[0]?.sections.find(
    (section) => section.title === 'Garantes',
  )?.items;
  assert.equal(items?.length, 2);
  assert.deepEqual(
    items?.map((item) => item.subsections.map((subsection) =>
      subsection.media.map((media) => media.filename))),
    [
      [['recibo-uno.pdf'], []],
      [[], ['titulo-dos.png']],
    ],
  );
});

test('SPEC-14 integration: client evidence flows from schema and presign to verified admin inspection', async () => {
  const environment: NodeJS.ProcessEnv = {
    ...ENVIRONMENT,
    CONTRACT_ADMIN_USER_IDS: 'agent-001',
  };
  let storedEntry = entry();
  const storedSubmissions: ContractSubmissionRecord[] = [];
  let saveCalls = 0;
  let verificationCalls = 0;
  const storedObjects = new Map<string, { size: number; contentType: string }>();
  const signedPaths: string[] = [];

  const repository: ContractEntryRepository = {
    async createEntry() {
      throw new Error('not used');
    },
    async findEntry(id) {
      return id === ENTRY_ID ? storedEntry : null;
    },
    async listEntries() {
      return [storedEntry];
    },
    async listSubmissions(id) {
      return storedSubmissions.filter((submission) => submission.entryId === id);
    },
    async saveRoleSubmission(input) {
      saveCalls += 1;
      assert.equal(input.authorizedTokenHash, storedEntry.clientTokenHash);
      storedEntry = entry({
        clientFilled: true,
        clientSubmittedAt: input.submittedAt,
        clientSubmission: input.fields,
      });
      storedSubmissions.push({
        id: input.submissionId,
        entryId: input.entryId,
        role: input.role,
        submission: input.fields,
        metadata: input.metadata,
        submittedAt: input.submittedAt,
      });
      return storedEntry;
    },
    async archiveEntry() {
      throw new Error('not used');
    },
    async replaceTokenHash() {
      throw new Error('not used');
    },
  };
  const storageClient = {
    storage: {
      from(bucket: string) {
        return {
          async info(path: string) {
            const object = storedObjects.get(path);
            return object
              ? {
                  data: {
                    id: `object-${path}`,
                    version: '1',
                    name: path,
                    bucketId: bucket,
                    createdAt: '2026-07-29T12:00:00.000Z',
                    ...object,
                  },
                  error: null,
                }
              : {
                  data: null,
                  error: { status: 404, message: 'Object not found' },
                };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  const app = express();
  app.use(express.json());
  app.use('/api/contracts', createContractEntriesRouter({
    environment,
    repository,
    now: () => new Date('2026-07-29T12:05:00.000Z'),
    rateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    issueEvidenceUploadUrls: async (entryId, descriptors) => descriptors.map(
      (descriptor, index) => ({
        ...evidenceReference(descriptor.field, {
          entryId,
          itemIndex: descriptor.itemIndex,
          filename: descriptor.filename,
          mimeType: descriptor.mimeType,
          size: descriptor.size,
        }),
        uploadUrl: `https://storage.example.test/upload/${index}`,
      }),
    ),
    verifyEvidenceReferences: async (targets, verificationEnvironment) => {
      verificationCalls += 1;
      return verifyContractEvidenceReferences(
        targets,
        verificationEnvironment,
        storageClient,
      );
    },
    issueEvidenceViewUrl: async (reference) => {
      signedPaths.push(reference.storagePath);
      return {
        viewUrl: `https://storage.example.test/view/${encodeURIComponent(reference.filename)}`,
        expiresAt: '2026-07-29T12:15:00.000Z',
      };
    },
  }));

  const schemaResponse = await request(app)
    .get(`/api/contracts/${ENTRY_ID}/schema`)
    .query({ role: 'client', token: CLIENT_TOKEN });
  assert.equal(schemaResponse.status, 200);
  const guarantorSchema = schemaResponse.body.sections.find(
    (section: { repeatable?: { name?: string } }) =>
      section.repeatable?.name === 'garantes',
  );
  assert.deepEqual(
    guarantorSchema.subsections.map(
      (subsection: { title: string; fileReceivers?: { label: string }[] }) => ({
        title: subsection.title,
        receiver: subsection.fileReceivers?.[0]?.label,
      }),
    ),
    [
      {
        title: 'Recibo de sueldo',
        receiver: 'Subir recibo de sueldo',
      },
      {
        title: 'Garantía propietaria',
        receiver: 'Subir garantía propietaria',
      },
    ],
  );

  const incompleteResponse = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/submit`)
    .query({ role: 'client', token: CLIENT_TOKEN })
    .send({
      fields: validClientFields([
        {
          guarantor_company: 'Empresa Uno',
          recibo_sueldo_files: [evidenceReference('recibo_sueldo_files')],
        },
        { guarantor_company: 'Empresa Dos' },
      ]),
    });
  assert.equal(incompleteResponse.status, 400);
  assert.equal(incompleteResponse.body.error, 'VALIDATION_FAILED');
  assert.ok(incompleteResponse.body.errors.some(
    (error: { field?: string }) => error.field === 'garantes.1._files',
  ));
  assert.equal(verificationCalls, 0);
  assert.equal(saveCalls, 0);

  const presignResponse = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/evidence-uploads/presign`)
    .query({ token: CLIENT_TOKEN })
    .send({
      uploads: [
        {
          collection: 'garantes',
          itemIndex: 0,
          field: 'recibo_sueldo_files',
          filename: 'recibo-uno.pdf',
          mimeType: 'application/pdf',
          size: 4096,
        },
        {
          collection: 'garantes',
          itemIndex: 1,
          field: 'garantia_propietaria_files',
          filename: 'titulo-dos.png',
          mimeType: 'image/png',
          size: 2048,
        },
      ],
    });
  assert.equal(presignResponse.status, 200);
  assert.equal(presignResponse.body.uploads.length, 2);
  assert.ok(presignResponse.body.uploads.every(
    (upload: { uploadUrl?: string }) => upload.uploadUrl?.startsWith(
      'https://storage.example.test/upload/',
    ),
  ));

  const stableReferences = presignResponse.body.uploads.map(
    (upload: ContractEvidenceFileReference & { uploadUrl: string }) => {
      storedObjects.set(upload.storagePath, {
        size: upload.size,
        contentType: upload.mimeType,
      });
      const { uploadUrl: _uploadUrl, ...reference } = upload;
      return reference;
    },
  );
  const submittedFields = validClientFields([
    {
      guarantor_company: 'Empresa Uno',
      recibo_sueldo_files: [stableReferences[0]],
    },
    {
      property_type: 'Casa',
      garantia_propietaria_files: [stableReferences[1]],
    },
  ]);
  const submitResponse = await request(app)
    .post(`/api/contracts/${ENTRY_ID}/submit`)
    .query({ role: 'client', token: CLIENT_TOKEN })
    .set('User-Agent', 'spec-14-integration-test')
    .send({ fields: submittedFields });
  assert.equal(submitResponse.status, 200);
  assert.equal(submitResponse.body.entryId, ENTRY_ID);
  assert.equal(submitResponse.body.status, 'open');
  assert.equal(verificationCalls, 1);
  assert.equal(saveCalls, 1);
  const persistedFields = storedSubmissions[0]?.submission;
  const persistedGuarantors = persistedFields?.garantes as
    | Record<string, unknown>[]
    | undefined;
  assert.deepEqual(persistedGuarantors?.[0]?.recibo_sueldo_files, [
    stableReferences[0],
  ]);
  assert.deepEqual(persistedGuarantors?.[0]?.garantia_propietaria_files, []);
  assert.deepEqual(persistedGuarantors?.[1]?.recibo_sueldo_files, []);
  assert.deepEqual(persistedGuarantors?.[1]?.garantia_propietaria_files, [
    stableReferences[1],
  ]);
  assert.equal(JSON.stringify(storedSubmissions).includes('uploadUrl'), false);

  const adminResponse = await request(app)
    .get(`/api/contracts/admin/entries/${ENTRY_ID}`)
    .set('X-User-Id', 'agent-001');
  assert.equal(adminResponse.status, 200);
  assert.equal(adminResponse.body.entry.clientFilled, true);
  assert.deepEqual(adminResponse.body.clientSubmission, persistedFields);
  const guarantorItems = adminResponse.body.inspection.submissions[0].sections.find(
    (section: { title?: string }) => section.title === 'Garantes',
  ).items;
  assert.deepEqual(
    guarantorItems.map((item: {
      subsections: { media: { filename: string }[] }[];
    }) => item.subsections.map(
      (subsection) => subsection.media.map((media) => media.filename),
    )),
    [
      [['recibo-uno.pdf'], []],
      [[], ['titulo-dos.png']],
    ],
  );
  assert.deepEqual(signedPaths, stableReferences.map((reference) => reference.storagePath));
  assert.equal(JSON.stringify(adminResponse.body.inspection).includes('storagePath'), false);
  assert.equal(JSON.stringify(adminResponse.body.inspection).includes('storageBucket'), false);
  assert.equal(JSON.stringify(adminResponse.body.inspection).includes('uploadUrl'), false);
});
