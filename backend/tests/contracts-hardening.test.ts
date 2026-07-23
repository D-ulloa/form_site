import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContractConfigurationError,
  RENT_CONTRACT_SCHEMA_ID,
  getContractSchemaConfig,
  getContractSchemaDefinition,
  getPublicContractSchema,
} from '../src/config/contractSchemas.js';
import type {
  ContractFieldDefinition,
  ContractFieldValue,
} from '../src/contracts/types.js';
import { validateContractSubmission } from '../src/services/validateContractSubmission.js';
import {
  GoogleServiceAccountConfigurationError,
  createGoogleServiceAccountAuth,
} from '../src/utils/googleServiceAccountAuth.js';

test('contract Google auth never falls back to configured user OAuth', () => {
  assert.throws(
    () => createGoogleServiceAccountAuth(
      ['https://www.googleapis.com/auth/spreadsheets'],
      {
        GOOGLE_CLIENT_ID: 'oauth-client',
        GOOGLE_CLIENT_SECRET: 'oauth-secret',
        GOOGLE_REFRESH_TOKEN: 'oauth-refresh',
      },
    ),
    GoogleServiceAccountConfigurationError,
  );

  const auth = createGoogleServiceAccountAuth(
    ['https://www.googleapis.com/auth/spreadsheets'],
    {
      GOOGLE_SERVICE_ACCOUNT_KEY_JSON: JSON.stringify({
        client_email: 'contracts@example.invalid',
        private_key: 'test-only-key',
      }),
    },
  );
  assert.equal(auth.constructor.name, 'GoogleAuth');
});

test('contract config rejects malformed public and Sheet destinations early', () => {
  assert.throws(
    () => getPublicContractSchema(RENT_CONTRACT_SCHEMA_ID, {
      CONTRACT_GOOGLE_FORM_LINK: 'javascript:alert(1)',
    }),
    (error: unknown) => {
      assert.ok(error instanceof ContractConfigurationError);
      assert.deepEqual(error.missingVariables, ['CONTRACT_GOOGLE_FORM_LINK']);
      return true;
    },
  );

  const baseEnvironment = {
    CONTRACT_GOOGLE_FORM_LINK: 'https://forms.gle/example',
    CONTRACT_GOOGLE_SHEET_ID: 'spreadsheet-id',
    CONTRACT_GOOGLE_SHEET_NAME: 'Contracts',
  };
  assert.throws(
    () => getContractSchemaConfig(RENT_CONTRACT_SCHEMA_ID, {
      ...baseEnvironment,
      CONTRACT_GOOGLE_SHEET_ID: 'bad/id',
    }),
    ContractConfigurationError,
  );
  assert.throws(
    () => getContractSchemaConfig(RENT_CONTRACT_SCHEMA_ID, {
      ...baseEnvironment,
      CONTRACT_GOOGLE_SHEET_NAME: 'Bad\nName',
    }),
    ContractConfigurationError,
  );
});

function valueFor(field: ContractFieldDefinition): ContractFieldValue {
  if (field.type === 'number') return field.min ?? 1;
  if (field.type === 'date') return '2026-08-01';
  if (field.type === 'boolean') return true;
  if (field.type === 'email') return `${field.name}@example.com`;
  if (field.type === 'select') return field.options?.[0] ?? '';
  return `${field.name} value`;
}

test('contract submission origin is limited to ui or api', () => {
  const schema = getContractSchemaDefinition(RENT_CONTRACT_SCHEMA_ID);
  const fields = Object.fromEntries(
    schema.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.required)
      .map((field) => [field.name, valueFor(field)]),
  );
  const base = {
    schemaId: schema.schemaId,
    contractType: schema.contractType,
    fields,
    meta: { userId: 'user-123', origin: 'ui' },
  };

  assert.equal(validateContractSubmission(base).success, true);
  assert.equal(
    validateContractSubmission({ ...base, meta: { ...base.meta, origin: 'api' } }).success,
    true,
  );
  const invalid = validateContractSubmission({
    ...base,
    meta: { ...base.meta, origin: 'untrusted-client' },
  });
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.ok(invalid.errors.some((issue) => issue.path === 'meta.origin'));
  }
});
