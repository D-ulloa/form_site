import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContractConfigurationError,
  RENT_CONTRACT_SCHEMA_ID,
  getContractSchemaConfig,
  getContractSchemaDefinition,
  getPublicContractSchema,
} from '../../src/config/contractSchemas.js';
import type {
  ContractFieldDefinition,
  ContractFieldValue,
  ContractSubmissionRequest,
} from '../../src/contracts/types.js';
import {
  ContractMappingError,
  mapContractFieldsToSheetRow,
} from '../../src/mappers/contractSheetRowMapper.js';
import { validateContractSubmission } from '../../src/services/validateContractSubmission.js';
import { sanitizeSheetValue } from '../../src/utils/sanitizeSheetValue.js';

function validValueFor(field: ContractFieldDefinition): ContractFieldValue {
  switch (field.type) {
    case 'email':
      return `${field.name}@example.com`;
    case 'number':
      return field.min ?? 1;
    case 'date':
      return '2026-08-01';
    case 'boolean':
      return true;
    case 'select':
      return field.options?.[0] ?? '';
    case 'string':
      return `${field.name} value`;
  }
}

function buildValidRequest(): ContractSubmissionRequest {
  const schema = getContractSchemaDefinition(RENT_CONTRACT_SCHEMA_ID);
  const fields: Record<string, ContractFieldValue> = {};

  for (const field of schema.sections.flatMap((section) => section.fields)) {
    if (field.required) fields[field.name] = validValueFor(field);
  }

  return {
    schemaId: RENT_CONTRACT_SCHEMA_ID,
    contractType: RENT_CONTRACT_SCHEMA_ID,
    fields,
    meta: { userId: 'user-123', origin: 'ui' },
  };
}

test('config getters read runtime env and public projection omits Sheet config', () => {
  const environment = {
    CONTRACT_GOOGLE_FORM_LINK: 'https://forms.gle/example',
    CONTRACT_GOOGLE_SHEET_ID: 'spreadsheet-id',
    CONTRACT_GOOGLE_SHEET_NAME: 'Contracts',
  };

  const publicSchema = getPublicContractSchema(RENT_CONTRACT_SCHEMA_ID, environment);
  assert.equal(publicSchema.googleFormLink, environment.CONTRACT_GOOGLE_FORM_LINK);
  assert.equal('sheet' in publicSchema, false);
  assert.equal('columnMap' in publicSchema, false);
  const ownerSection = publicSchema.sections.find((section) =>
    section.fields.some((field) => field.name === 'witness_full_name'));
  assert.equal(ownerSection?.title, 'Propietario');
  const adjustmentField = publicSchema.sections
    .flatMap((section) => section.fields)
    .find((field) => field.name === 'contract_selection');
  assert.equal(adjustmentField?.label, 'Ajuste');

  const fullSchema = getContractSchemaConfig(RENT_CONTRACT_SCHEMA_ID, environment);
  assert.equal(fullSchema.sheet.spreadsheetId, environment.CONTRACT_GOOGLE_SHEET_ID);
  assert.equal(fullSchema.sheet.sheetName, environment.CONTRACT_GOOGLE_SHEET_NAME);
  assert.equal(fullSchema.sheet.columnMap.contract_selection, 'Ajuste');

  assert.throws(
    () => getContractSchemaConfig(RENT_CONTRACT_SCHEMA_ID, {}),
    (error: unknown) => {
      assert.ok(error instanceof ContractConfigurationError);
      assert.deepEqual(error.missingVariables, [
        'CONTRACT_GOOGLE_FORM_LINK',
        'CONTRACT_GOOGLE_SHEET_ID',
        'CONTRACT_GOOGLE_SHEET_NAME',
      ]);
      return true;
    },
  );
});

test('strict validation accepts normalized input and rejects unknown fields', () => {
  assert.equal(validateContractSubmission(buildValidRequest()).success, true);

  const request = buildValidRequest();
  const invalid = validateContractSubmission({
    ...request,
    fields: { ...request.fields, arbitrary_formula: '=IMPORTXML(...)' },
  });
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.ok(invalid.errors.some((issue) =>
      issue.path === 'fields.arbitrary_formula' && issue.code === 'unknown_field'));
  }
});

test('strict validation rejects coercion, impossible dates, limits, and type mismatch', () => {
  const request = buildValidRequest();
  const invalid = validateContractSubmission({
    ...request,
    contractType: 'different-contract',
    fields: {
      ...request.fields,
      tenant_age: '21',
      contract_months: 0,
      contract_start_date: '2026-02-30',
      tenant_email: 'not-an-email',
    },
  });

  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.deepEqual(new Set(invalid.errors.map((issue) => issue.code)), new Set([
      'contract_type_mismatch', 'invalid_type', 'invalid_email', 'min', 'invalid_date',
    ]));
  }
});

test('formula sanitization catches every Sheets formula prefix after whitespace', () => {
  for (const value of ['=1+1', ' +SUM(A:A)', '\t-2', '\r\n@command']) {
    assert.equal(sanitizeSheetValue(value), `'${value}`);
  }
  assert.equal(sanitizeSheetValue('ordinary text'), 'ordinary text');
  assert.equal(sanitizeSheetValue(42), 42);
  assert.equal(sanitizeSheetValue(false), false);
});

test('mapper follows schema order, escapes formulas, and emits optional blanks', () => {
  const request = buildValidRequest();
  const validation = validateContractSubmission({
    ...request,
    fields: { ...request.fields, contract_object: ' =SUM(A:A)' },
  });
  assert.equal(validation.success, true);
  if (!validation.success) return;

  const schema = getContractSchemaDefinition(RENT_CONTRACT_SCHEMA_ID);
  const mapped = mapContractFieldsToSheetRow(schema, validation.data.fields);

  assert.equal(mapped.values.length, 32);
  assert.equal(mapped.fieldNames.includes('approve_contract'), false);
  assert.deepEqual(mapped.fieldNames.slice(0, 3), [
    'tenant_full_name', 'tenant_dni', 'tenant_phone',
  ]);
  assert.equal(mapped.values[mapped.fieldNames.indexOf('contract_object')], "' =SUM(A:A)");
  assert.equal(mapped.values[mapped.fieldNames.indexOf('guarantor_company')], '');
  assert.equal(
    mapped.columnHeaders[mapped.fieldNames.indexOf('tenant_full_name')],
    'Nombre Completo (Apellidos, Nombres)',
  );
});

test('mapper reports actionable configuration and payload errors', () => {
  const schema = getContractSchemaDefinition(RENT_CONTRACT_SCHEMA_ID);
  const validation = validateContractSubmission(buildValidRequest());
  assert.equal(validation.success, true);
  if (!validation.success) return;

  assert.throws(
    () => mapContractFieldsToSheetRow(
      { ...schema, columnMap: { ...schema.columnMap, unknown: 'Unknown' } },
      validation.data.fields,
    ),
    ContractMappingError,
  );
  assert.throws(
    () => mapContractFieldsToSheetRow(schema, {
      ...validation.data.fields,
      unknown: 'value',
    }),
    ContractMappingError,
  );
});
