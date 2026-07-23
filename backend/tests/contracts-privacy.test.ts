import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RENT_CONTRACT_SCHEMA_ID,
  getContractSchemaDefinition,
} from '../src/config/contractSchemas.js';
import {
  REDACTED_CONTRACT_VALUE,
  buildContractAuditLog,
} from '../src/services/contractAuditLogger.js';

test('nationality and employment-identifying values never persist verbatim', () => {
  const schema = getContractSchemaDefinition(RENT_CONTRACT_SCHEMA_ID);
  const fieldNames = [
    'tenant_nationality',
    'guarantor_nationality',
    'guarantor_company',
    'guarantor_position',
    'witness_nationality',
  ];
  const rawValues = ['Argentina', 'Chile', 'Private Employer', 'Manager', 'Uruguay'];
  const fields = Object.fromEntries(
    fieldNames.map((fieldName, index) => [fieldName, rawValues[index] ?? '']),
  );
  const audit = buildContractAuditLog({
    schema,
    fields,
    mappedRow: {
      fieldNames,
      columnHeaders: fieldNames,
      values: rawValues,
    },
    spreadsheetId: 'spreadsheet-id',
    sheetName: 'Contracts',
    appendedRange: 'Contracts!A2:E2',
    submissionId: 'SUB-2026-07-21-A1B2C3D4',
    userId: 'user-123',
    timestamp: '2026-07-21T18:30:00.000Z',
    requestId: 'request-123',
    ip: '127.0.0.1',
  });

  for (const fieldName of fieldNames) {
    assert.equal(audit.fields[fieldName], REDACTED_CONTRACT_VALUE);
  }
  assert.deepEqual(
    audit.mappedRow,
    fieldNames.map(() => REDACTED_CONTRACT_VALUE),
  );
  for (const rawValue of rawValues) {
    assert.equal(JSON.stringify(audit).includes(rawValue), false);
  }
});
