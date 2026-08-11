import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  RENT_CONTRACT_SCHEMA_ID,
  getContractSchemaDefinition,
} from '../../src/config/contractSchemas.js';
import {
  ContractAuditAlreadyExistsError,
  InvalidContractSubmissionIdError,
  REDACTED_CONTRACT_VALUE,
  buildContractAuditLog,
  persistContractAuditLog,
  readContractAuditLog,
} from '../../src/services/contractAuditLogger.js';
import {
  ContractSheetsAppendError,
  appendContractSheetRow,
  isRetriableGoogleSheetsError,
} from '../../src/services/googleSheetsService.js';

test('contract Sheet append sends exact RAW request and returns updatedRange', async () => {
  let captured: unknown;
  const result = await appendContractSheetRow(
    {
      spreadsheetId: 'sheet-id',
      sheetName: "Lease's 2026",
      columnHeaders: ['Name', 'Months', 'Approved'],
      row: ['Alice', 12, true],
    },
    {
      readHeaders: async () => ({ data: { values: [['Name', 'Months', 'Approved']] } }),
      execute: async (request) => {
        captured = request;
        return { data: { updates: { updatedRange: "Lease's 2026!A8:C8" } } };
      },
      sleep: async () => undefined,
    },
  );

  assert.deepEqual(captured, {
    spreadsheetId: 'sheet-id',
    range: "'Lease''s 2026'!A1",
    valueInputOption: 'RAW',
    requestBody: { values: [['Alice', 12, true]] },
  });
  assert.deepEqual(result, { appendedRange: "Lease's 2026!A8:C8" });
});

test('contract Sheet append retries only transient Google failures', async () => {
  let transientAttempts = 0;
  const delays: number[] = [];

  await assert.rejects(
    appendContractSheetRow(
      { spreadsheetId: 'sheet-id', sheetName: 'Contracts', columnHeaders: ['Value'], row: ['value'] },
      {
        readHeaders: async () => ({ data: { values: [['Value']] } }),
        execute: async () => {
          transientAttempts += 1;
          throw { response: { status: 503 } };
        },
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
        initialDelayMs: 10,
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ContractSheetsAppendError);
      assert.equal(error.retriable, true);
      assert.equal(error.providerStatus, 503);
      return true;
    },
  );
  assert.equal(transientAttempts, 3);
  assert.deepEqual(delays, [10, 20]);

  let permanentAttempts = 0;
  await assert.rejects(
    appendContractSheetRow(
      { spreadsheetId: 'sheet-id', sheetName: 'Contracts', columnHeaders: ['Value'], row: ['value'] },
      {
        readHeaders: async () => ({ data: { values: [['Value']] } }),
        execute: async () => {
          permanentAttempts += 1;
          throw { response: { status: 403 } };
        },
        sleep: async () => undefined,
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ContractSheetsAppendError);
      assert.equal(error.retriable, false);
      assert.equal(error.providerStatus, 403);
      return true;
    },
  );
  assert.equal(permanentAttempts, 1);
  assert.equal(isRetriableGoogleSheetsError({ code: 'ECONNRESET' }), true);
  assert.equal(isRetriableGoogleSheetsError({ response: { status: 400 } }), false);
});

test('audit builder redacts sensitive fields and matching mapped values', () => {
  const schema = getContractSchemaDefinition(RENT_CONTRACT_SCHEMA_ID);
  const audit = buildContractAuditLog({
    schema,
    fields: {
      tenant_full_name: 'Alice Example',
      tenant_nationality: 'Argentina',
    },
    mappedRow: {
      fieldNames: ['tenant_full_name', 'tenant_nationality'],
      columnHeaders: ['Name', 'Nationality'],
      values: ['Alice Example', 'Argentina'],
    },
    spreadsheetId: 'sheet-id',
    sheetName: 'Contracts',
    appendedRange: 'Contracts!A2:B2',
    submissionId: 'SUB-2026-07-21-A1B2C3D4',
    userId: 'user-123',
    timestamp: '2026-07-21T12:00:00.000Z',
    requestId: 'request-123',
    ip: '127.0.0.1',
  });

  assert.equal(audit.fields.tenant_full_name, REDACTED_CONTRACT_VALUE);
  assert.equal(audit.fields.tenant_nationality, REDACTED_CONTRACT_VALUE);
  assert.deepEqual(audit.mappedRow, [REDACTED_CONTRACT_VALUE, REDACTED_CONTRACT_VALUE]);
  assert.equal(JSON.stringify(audit).includes('Alice Example'), false);
});

test('audit persistence is exclusive and reads only strict submission IDs', async () => {
  const logsDirectory = await mkdtemp(join(tmpdir(), 'contract-audits-'));
  const schema = getContractSchemaDefinition(RENT_CONTRACT_SCHEMA_ID);
  const audit = buildContractAuditLog({
    schema,
    fields: { tenant_full_name: 'Alice Example' },
    mappedRow: {
      fieldNames: ['tenant_full_name'],
      columnHeaders: ['Name'],
      values: ['Alice Example'],
    },
    spreadsheetId: 'sheet-id',
    sheetName: 'Contracts',
    appendedRange: 'Contracts!A2',
    submissionId: 'SUB-2026-07-21-DEADBEEF',
    userId: 'user-123',
    timestamp: '2026-07-21T12:00:00.000Z',
    requestId: 'request-123',
    ip: '127.0.0.1',
  });

  try {
    await persistContractAuditLog(audit, { logsDirectory });
    assert.deepEqual(
      await readContractAuditLog(audit.submissionId, { logsDirectory }),
      audit,
    );
    await assert.rejects(
      persistContractAuditLog(audit, { logsDirectory }),
      ContractAuditAlreadyExistsError,
    );
    await assert.rejects(
      readContractAuditLog('../../etc/passwd', { logsDirectory }),
      InvalidContractSubmissionIdError,
    );
  } finally {
    await rm(logsDirectory, { recursive: true, force: true });
  }
});
