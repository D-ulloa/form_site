import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import express from 'express';
import request from 'supertest';
import { getContractRoleSchema } from '../src/config/contractSchemas.js';
import type {
  ContractDniImageReference,
  ContractEntryRecord,
  ContractRole,
  ContractSubmissionRecord,
} from '../src/contracts/types.js';
import { createContractEntriesRouter } from '../src/routes/contractEntries.js';
import {
  buildContractAdminInspection,
} from '../src/services/contractAdminInspectionService.js';
import {
  createContractEntryRepository,
  type ContractEntryRepository,
  type CreateContractEntryRecordInput,
  type SaveContractRoleSubmissionInput,
} from '../src/services/contractEntryRepository.js';
import {
  ContractDniUploadValidationError,
  issueContractDniViewUrl,
} from '../src/services/contractDniUploadService.js';

const ENTRY_ID = '11111111-1111-4111-8111-111111111111';
const USER_SUBMISSION_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_SUBMISSION_ID = '33333333-3333-4333-8333-333333333333';
const ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  CONTRACT_ADMIN_USER_IDS: 'agent-001',
  CONTRACT_DNI_STORAGE_BUCKET: 'contract-dni',
};
const METADATA = {
  ip: '127.0.0.1',
  userAgent: 'spec-13-test',
  receivedAt: '2026-07-29T12:05:00.000Z',
};

function entry(overrides: Partial<ContractEntryRecord> = {}): ContractEntryRecord {
  return {
    id: ENTRY_ID,
    schemaId: 'rent-contract-v1',
    createdBy: 'agent-001',
    createdAt: '2026-07-29T12:00:00.000Z',
    userTokenHash: 'private-user-token-hash',
    clientTokenHash: 'private-client-token-hash',
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

function userSubmission(
  submission: Readonly<Record<string, unknown>> = {
    submission_date: '2026-07-29',
    contract_selection: 'IPC',
    contract_formatted_update: '2027-01-31',
    contract_update: 6,
    contract_rent_amount: 900000,
    contract_formatted_start: '2026-07-31',
    contract_start_date: '2026-08-15',
    contract_months: 24,
    contract_object: 'Vivienda',
    witness_nationality: 'Argentina',
    witness_dni: '12.345.678',
    witness_full_name: 'Propietaria, Paula',
  },
): ContractSubmissionRecord {
  return {
    id: USER_SUBMISSION_ID,
    entryId: ENTRY_ID,
    role: 'user',
    submission,
    metadata: METADATA,
    submittedAt: '2026-07-29T12:05:00.000Z',
  };
}

function clientSubmission(
  submission: Readonly<Record<string, unknown>> = {
    garantes: [{
      property_type: 'Casa',
      property_address: 'Calle Garante 456',
      property_province: 'Córdoba',
      property_registration_number: 'MAT-123',
      guarantor_company_registration: '3515550101',
      guarantor_employee_id: 'LEG-9',
      guarantor_position: 'Analista',
      guarantor_cuit: '30-12345678-9',
      guarantor_company: 'Empresa SA',
      guarantor_address: 'Calle Garante 456',
      guarantor_email: 'garante@example.test',
      guarantor_nationality: 'Argentina',
      guarantor_phone: '3515550100',
      guarantor_dni: '23.456.789',
      guarantor_full_name: 'Garante, Graciela',
    }],
    inquilinos: [{
      tenant_age: 31,
      tenant_email: 'inquilino@example.test',
      tenant_nationality: 'Argentina',
      tenant_phone: '3515550199',
      tenant_dni: '34.567.890',
      tenant_full_name: 'Inquilino, Ignacio',
    }],
  },
): ContractSubmissionRecord {
  return {
    id: CLIENT_SUBMISSION_ID,
    entryId: ENTRY_ID,
    role: 'client',
    submission,
    metadata: METADATA,
    submittedAt: '2026-07-29T12:06:00.000Z',
  };
}

function imageReference(
  collection: 'inquilinos' | 'garantes',
  slot: 'front' | 'back',
): ContractDniImageReference {
  const storagePath = [
    'contracts',
    ENTRY_ID,
    'client',
    collection,
    '0',
    `${slot}-44444444-4444-4444-8444-444444444444-dni-${slot}.jpg`,
  ].join('/');
  return {
    originalName: `dni-${slot}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
    storagePath,
    storageBucket: 'contract-dni',
    publicPath: `contract-dni/${storagePath}`,
    slot,
  };
}

test('SPEC-13 user Contrato schema exposes the exact Vigencia, Canon, and Ajuste groups', () => {
  const schema = getContractRoleSchema('rent-contract-v1', 'user');
  const contract = schema.sections.find((section) => section.title === 'Contrato');

  assert.deepEqual(contract?.subsections, [
    {
      title: 'Vigencia',
      fieldNames: [
        'contract_months',
        'contract_start_date',
        'contract_formatted_start',
      ],
    },
    {
      title: 'Canon',
      fieldNames: [
        'contract_rent_amount',
        'contract_update',
        'contract_formatted_update',
      ],
    },
    {
      title: 'Ajuste',
      fieldNames: [
        'contract_selection',
        'submission_date',
      ],
    },
  ]);
});

test('admin entry listing reads every database page instead of silently capping results', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    id: `entry-${index}`,
    schema_id: 'rent-contract-v1',
    created_by: 'agent-001',
    created_at: new Date(Date.UTC(2026, 6, 29, 12, 0, 0) - index).toISOString(),
    user_token_hash: 'private-user-token-hash',
    client_token_hash: 'private-client-token-hash',
    user_filled: false,
    client_filled: false,
    user_submitted_at: null,
    client_submitted_at: null,
    user_submission: null,
    client_submission: null,
    combined_submission: null,
    status: 'open',
    archived_at: null,
  }));
  const ranges: Array<[number, number]> = [];
  const query = {
    select(selection: string, options: { count: string }) {
      assert.equal(selection, '*');
      assert.deepEqual(options, { count: 'exact' });
      return query;
    },
    order(column: string, options: { ascending: boolean }) {
      assert.equal(column, 'created_at');
      assert.deepEqual(options, { ascending: false });
      return query;
    },
    async range(from: number, to: number) {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null, count: rows.length };
    },
  };
  const client = {
    from(table: string) {
      assert.equal(table, 'contract_entries');
      return query;
    },
  } as unknown as SupabaseClient;
  const repository = createContractEntryRepository(ENVIRONMENT, client);

  const listed = await repository.listEntries();

  assert.equal(listed.length, 1001);
  assert.equal(listed[0]?.id, 'entry-0');
  assert.equal(listed[1000]?.id, 'entry-1000');
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
});

test('admin inspection ignores payload key order and emits user then client in form order', async () => {
  const inspection = await buildContractAdminInspection(
    entry({ userFilled: true, clientFilled: true, status: 'complete' }),
    [clientSubmission(), userSubmission()],
    ENVIRONMENT,
  );

  assert.equal(inspection.hasSubmissions, true);
  assert.deepEqual(
    inspection.submissions.map((submission) => submission.role),
    ['user', 'client'],
  );

  const userSections = inspection.submissions[0]?.sections;
  assert.deepEqual(userSections?.map((section) => section.title), ['Propietario', 'Contrato']);
  assert.deepEqual(
    userSections?.[0]?.fields.map((field) => field.name),
    ['witness_full_name', 'witness_dni', 'witness_nationality'],
  );
  assert.deepEqual(
    userSections?.[1]?.fields.map((field) => field.name),
    ['contract_object'],
  );
  assert.deepEqual(
    userSections?.[1]?.subsections.map((subsection) => ({
      title: subsection.title,
      fields: subsection.fields.map((field) => field.name),
    })),
    [
      {
        title: 'Vigencia',
        fields: [
          'contract_months',
          'contract_start_date',
          'contract_formatted_start',
        ],
      },
      {
        title: 'Canon',
        fields: [
          'contract_rent_amount',
          'contract_update',
          'contract_formatted_update',
        ],
      },
      {
        title: 'Ajuste',
        fields: ['contract_selection', 'submission_date'],
      },
    ],
  );

  const clientSections = inspection.submissions[1]?.sections;
  assert.deepEqual(clientSections?.map((section) => section.title), ['Inquilino', 'Garantes']);
  assert.deepEqual(
    clientSections?.[0]?.items[0]?.fields.map((field) => field.name),
    [
      'tenant_full_name',
      'tenant_dni',
      'tenant_phone',
      'tenant_nationality',
      'tenant_email',
      'tenant_age',
    ],
  );
  assert.deepEqual(
    clientSections?.[1]?.items[0]?.subsections.map((subsection) => subsection.title),
    ['Recibo de sueldo', 'Garantía propietaria'],
  );
});

test('admin inspection represents neither, either, or both immutable role submissions', async () => {
  const cases: readonly {
    readonly rows: readonly ContractSubmissionRecord[];
    readonly roles: readonly ContractRole[];
    readonly hasSubmissions: boolean;
  }[] = [
    { rows: [], roles: [], hasSubmissions: false },
    { rows: [userSubmission()], roles: ['user'], hasSubmissions: true },
    { rows: [clientSubmission()], roles: ['client'], hasSubmissions: true },
    {
      rows: [clientSubmission(), userSubmission()],
      roles: ['user', 'client'],
      hasSubmissions: true,
    },
  ];

  for (const scenario of cases) {
    const inspection = await buildContractAdminInspection(
      entry(),
      scenario.rows,
      ENVIRONMENT,
    );
    assert.equal(inspection.hasSubmissions, scenario.hasSubmissions);
    assert.deepEqual(
      inspection.submissions.map((submission) => submission.role),
      scenario.roles,
    );
  }
});

test('admin inspection signs private DNI media and associates it with its repeatable item', async () => {
  const front = imageReference('inquilinos', 'front');
  const back = imageReference('inquilinos', 'back');
  const row = clientSubmission({
    garantes: [],
    inquilinos: [{
      tenant_full_name: 'Inquilino, Ignacio',
      tenant_dni_front_image: front,
      tenant_dni_back_image: back,
    }],
  });
  const signedPaths: string[] = [];

  const inspection = await buildContractAdminInspection(
    entry({ clientFilled: true }),
    [row],
    ENVIRONMENT,
    {
      issueDniViewUrl: async (reference) => {
        signedPaths.push(reference.storagePath);
        return {
          viewUrl: `https://media.example.test/${reference.slot}`,
          expiresAt: '2026-07-29T12:20:00.000Z',
        };
      },
    },
  );

  const tenantMedia = inspection.submissions[0]?.sections[0]?.items[0]?.media;
  assert.deepEqual(signedPaths, [front.storagePath, back.storagePath]);
  assert.deepEqual(tenantMedia, [
    {
      fieldName: 'tenant_dni_front_image',
      label: 'Frente DNI',
      slot: 'front',
      originalName: 'dni-front.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      viewUrl: 'https://media.example.test/front',
      expiresAt: '2026-07-29T12:20:00.000Z',
    },
    {
      fieldName: 'tenant_dni_back_image',
      label: 'Dorso DNI',
      slot: 'back',
      originalName: 'dni-back.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      viewUrl: 'https://media.example.test/back',
      expiresAt: '2026-07-29T12:20:00.000Z',
    },
  ]);
  assert.equal(JSON.stringify(tenantMedia).includes('storagePath'), false);
  assert.equal(JSON.stringify(tenantMedia).includes('storageBucket'), false);
  assert.equal(JSON.stringify(tenantMedia).includes('publicPath'), false);
});

test('private DNI view signing uses the stored bucket/path with a short-lived URL', async () => {
  const reference = imageReference('inquilinos', 'front');
  const calls: { bucket?: string; path?: string; ttl?: number } = {};
  const client = {
    storage: {
      from(bucket: string) {
        calls.bucket = bucket;
        return {
          async createSignedUrl(path: string, ttl: number) {
            calls.path = path;
            calls.ttl = ttl;
            return {
              data: { signedUrl: 'https://storage.example.test/signed-dni' },
              error: null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  const signed = await issueContractDniViewUrl(
    reference,
    ENVIRONMENT,
    client,
    () => new Date('2026-07-29T12:00:00.000Z'),
  );

  assert.deepEqual(calls, {
    bucket: 'contract-dni',
    path: reference.storagePath,
    ttl: 600,
  });
  assert.deepEqual(signed, {
    viewUrl: 'https://storage.example.test/signed-dni',
    expiresAt: '2026-07-29T12:10:00.000Z',
  });
  await assert.rejects(
    issueContractDniViewUrl(
      {
        ...reference,
        storageBucket: 'attacker-bucket',
        publicPath: `attacker-bucket/${reference.storagePath}`,
      },
      ENVIRONMENT,
      client,
    ),
    ContractDniUploadValidationError,
  );
});

class InspectionRepository implements ContractEntryRepository {
  listSubmissionCalls = 0;

  constructor(
    readonly storedEntry: ContractEntryRecord,
    readonly storedSubmissions: readonly ContractSubmissionRecord[],
  ) {}

  async createEntry(_input: CreateContractEntryRecordInput): Promise<ContractEntryRecord> {
    throw new Error('not used');
  }

  async findEntry(entryId: string): Promise<ContractEntryRecord | null> {
    return entryId === this.storedEntry.id ? this.storedEntry : null;
  }

  async listEntries(): Promise<readonly ContractEntryRecord[]> {
    return [this.storedEntry];
  }

  async listSubmissions(entryId: string): Promise<readonly ContractSubmissionRecord[]> {
    this.listSubmissionCalls += 1;
    return this.storedSubmissions.filter((submission) => submission.entryId === entryId);
  }

  async saveRoleSubmission(_input: SaveContractRoleSubmissionInput): Promise<ContractEntryRecord> {
    throw new Error('not used');
  }

  async archiveEntry(_entryId: string, _archivedAt: string): Promise<ContractEntryRecord> {
    throw new Error('not used');
  }

  async replaceTokenHash(
    _entryId: string,
    _role: ContractRole,
    _tokenHash: string,
    _occurredAt: string,
  ): Promise<ContractEntryRecord> {
    throw new Error('not used');
  }
}

test('admin detail explicitly reads immutable rows and prefers them over entry payload copies', async () => {
  const staleEntryPayload = {
    witness_full_name: 'STALE ENTRY COPY',
  };
  const immutablePayload = {
    witness_full_name: 'Immutable submission value',
  };
  const repository = new InspectionRepository(
    entry({
      userFilled: true,
      userSubmittedAt: '2026-07-29T12:05:00.000Z',
      userSubmission: staleEntryPayload,
    }),
    [userSubmission(immutablePayload)],
  );
  const app = express();
  app.use(express.json());
  app.use('/api/contracts', createContractEntriesRouter({
    environment: ENVIRONMENT,
    repository,
    rateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    issueDniViewUrl: async () => {
      throw new Error('not used');
    },
  }));

  const unauthorized = await request(app)
    .get(`/api/contracts/admin/entries/${ENTRY_ID}`);
  assert.equal(unauthorized.status, 401);
  assert.equal(repository.listSubmissionCalls, 0);

  const response = await request(app)
    .get(`/api/contracts/admin/entries/${ENTRY_ID}`)
    .set('X-User-Id', 'agent-001');
  assert.equal(response.status, 200);
  assert.equal(repository.listSubmissionCalls, 1);
  assert.deepEqual(response.body.userSubmission, immutablePayload);
  assert.equal(response.body.clientSubmission, null);
  assert.equal(
    response.body.inspection.submissions[0].sections[0].fields[0].value,
    'Immutable submission value',
  );
  assert.equal(JSON.stringify(response.body).includes('STALE ENTRY COPY'), false);
  assert.equal(JSON.stringify(response.body).includes('private-user-token-hash'), false);
  assert.equal(JSON.stringify(response.body).includes('submission_meta'), false);
  assert.equal(response.headers['cache-control'], 'no-store');
});
