import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RENT_CONTRACT_SCHEMA_ID,
  getContractSchemaConfig,
  getContractSchemaDefinition,
} from '../src/config/contractSchemas.js';
import type {
  ContractFieldDefinition,
  ContractFieldValue,
  ContractSchemaConfig,
  ValidatedContractSubmission,
} from '../src/contracts/types.js';
import { ContractMappingError } from '../src/mappers/contractSheetRowMapper.js';
import type { ContractAuditLog } from '../src/services/contractAuditLogger.js';
import {
  ContractAuditPersistenceError,
  createContractSubmission,
  generateContractSubmissionId,
} from '../src/services/createContractSubmission.js';
import {
  CONTRACT_METRICS,
  type ContractCounterMetric,
  type ContractLatencyMetric,
  type ContractMetricsRecorder,
} from '../src/services/contractMetrics.js';
import { validateContractSubmission } from '../src/services/validateContractSubmission.js';

function valueFor(field: ContractFieldDefinition): ContractFieldValue {
  if (field.type === 'number') return field.min ?? 1;
  if (field.type === 'date') return '2026-08-01';
  if (field.type === 'boolean') return true;
  if (field.type === 'email') return `${field.name}@example.com`;
  if (field.type === 'select') return field.options?.[0] ?? '';
  return `${field.name} value`;
}

function buildSubmission(): {
  config: ContractSchemaConfig;
  submission: ValidatedContractSubmission;
} {
  const schema = getContractSchemaDefinition(RENT_CONTRACT_SCHEMA_ID);
  const fields: Record<string, ContractFieldValue> = {};
  for (const field of schema.sections.flatMap((section) => section.fields)) {
    if (field.required) fields[field.name] = valueFor(field);
  }
  fields.contract_object = ' =SUM(A:A)';

  const validation = validateContractSubmission({
    schemaId: schema.schemaId,
    contractType: schema.contractType,
    fields,
    meta: { userId: 'user-123', origin: 'ui' },
  });
  assert.equal(validation.success, true);
  if (!validation.success) throw new Error('Fixture validation failed.');

  return {
    submission: validation.data,
    config: getContractSchemaConfig(RENT_CONTRACT_SCHEMA_ID, {
      CONTRACT_GOOGLE_FORM_LINK: 'https://forms.gle/example',
      CONTRACT_GOOGLE_SHEET_ID: 'spreadsheet-id',
      CONTRACT_GOOGLE_SHEET_NAME: 'Contracts',
    }),
  };
}

function createMetricsRecorder(): {
  recorder: ContractMetricsRecorder;
  increments: ContractCounterMetric[];
  observations: { metric: ContractLatencyMetric; value: number }[];
} {
  const increments: ContractCounterMetric[] = [];
  const observations: { metric: ContractLatencyMetric; value: number }[] = [];
  return {
    increments,
    observations,
    recorder: {
      increment(metric) {
        increments.push(metric);
      },
      observe(metric, value) {
        observations.push({ metric, value });
      },
    },
  };
}

test('contract orchestration appends, persists redacted audit, and returns receipt', async () => {
  const fixture = buildSubmission();
  const metrics = createMetricsRecorder();
  const events: string[] = [];
  let persistedAudit: ContractAuditLog | undefined;
  const monotonicTimes = [100, 137];

  const receipt = await createContractSubmission(
    {
      ...fixture,
      requestId: 'request-123',
      ip: '203.0.113.10',
    },
    {
      appendRow: async (input) => {
        events.push('append');
        const schema = getContractSchemaDefinition(RENT_CONTRACT_SCHEMA_ID);
        const contractObjectIndex = schema.sections
          .flatMap((section) => section.fields)
          .findIndex((field) => field.name === 'contract_object');
        assert.equal(input.row[contractObjectIndex], "' =SUM(A:A)");
        return { appendedRange: 'Contracts!A42:AG42' };
      },
      persistAudit: async (audit) => {
        events.push('audit');
        persistedAudit = audit;
      },
      now: () => new Date('2026-07-21T18:30:00.000Z'),
      monotonicNow: () => monotonicTimes.shift() ?? 137,
      generateSubmissionId: () => 'SUB-2026-07-21-A1B2C3D4',
      metrics: metrics.recorder,
    },
  );

  assert.deepEqual(events, ['append', 'audit']);
  assert.deepEqual(receipt, {
    submissionId: 'SUB-2026-07-21-A1B2C3D4',
    timestamp: '2026-07-21T18:30:00.000Z',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/spreadsheet-id/edit',
    appendedRange: 'Contracts!A42:AG42',
    auditUrl: '/api/contracts/audits/SUB-2026-07-21-A1B2C3D4',
  });
  assert.ok(persistedAudit);
  assert.equal(persistedAudit.fields.tenant_full_name, '[REDACTED]');
  assert.equal(persistedAudit.mappedRow[0], '[REDACTED]');
  assert.deepEqual(metrics.increments, [
    CONTRACT_METRICS.total,
    CONTRACT_METRICS.success,
  ]);
  assert.deepEqual(metrics.observations, [
    { metric: CONTRACT_METRICS.latency, value: 37 },
  ]);
});

test('mapping failure records failure metrics without appending or auditing', async () => {
  const fixture = buildSubmission();
  const metrics = createMetricsRecorder();
  let appendCalls = 0;
  let auditCalls = 0;
  const brokenColumnMap = Object.fromEntries(
    Object.entries(fixture.config.sheet.columnMap)
      .filter(([fieldName]) => fieldName !== 'tenant_full_name'),
  );

  await assert.rejects(
    createContractSubmission(
      {
        ...fixture,
        config: {
          ...fixture.config,
          sheet: { ...fixture.config.sheet, columnMap: brokenColumnMap },
        },
        requestId: 'request-123',
        ip: '127.0.0.1',
      },
      {
        appendRow: async () => {
          appendCalls += 1;
          return { appendedRange: 'unexpected' };
        },
        persistAudit: async () => {
          auditCalls += 1;
        },
        monotonicNow: (() => {
          const values = [10, 15];
          return () => values.shift() ?? 15;
        })(),
        metrics: metrics.recorder,
      },
    ),
    ContractMappingError,
  );

  assert.equal(appendCalls, 0);
  assert.equal(auditCalls, 0);
  assert.deepEqual(metrics.increments, [
    CONTRACT_METRICS.total,
    CONTRACT_METRICS.failure,
  ]);
  assert.deepEqual(metrics.observations, [
    { metric: CONTRACT_METRICS.latency, value: 5 },
  ]);
});

test('audit failure after append is explicitly non-retriable', async () => {
  const fixture = buildSubmission();
  const metrics = createMetricsRecorder();
  const events: string[] = [];

  await assert.rejects(
    createContractSubmission(
      { ...fixture, requestId: 'request-123', ip: '127.0.0.1' },
      {
        appendRow: async () => {
          events.push('append');
          return { appendedRange: 'Contracts!A42:AG42' };
        },
        persistAudit: async () => {
          events.push('audit');
          throw new Error('disk unavailable');
        },
        now: () => new Date('2026-07-21T18:30:00.000Z'),
        monotonicNow: (() => {
          const values = [20, 29];
          return () => values.shift() ?? 29;
        })(),
        generateSubmissionId: () => 'SUB-2026-07-21-DEADBEEF',
        metrics: metrics.recorder,
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ContractAuditPersistenceError);
      assert.equal(error.appendCompleted, true);
      assert.equal(error.retriable, false);
      assert.equal(error.submissionId, 'SUB-2026-07-21-DEADBEEF');
      return true;
    },
  );

  assert.deepEqual(events, ['append', 'audit']);
  assert.deepEqual(metrics.increments, [
    CONTRACT_METRICS.total,
    CONTRACT_METRICS.failure,
  ]);
  assert.deepEqual(metrics.observations, [
    { metric: CONTRACT_METRICS.latency, value: 9 },
  ]);
});

test('default contract submission IDs use the required date and hex shape', () => {
  assert.match(
    generateContractSubmissionId(new Date('2026-07-21T01:02:03.000Z')),
    /^SUB-2026-07-21-[A-F0-9]{8}$/u,
  );
});
