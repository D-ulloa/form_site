import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ContractSchemaDefinition,
  ContractSubmissionRequest,
} from '../src/contracts/types.js';
import { validateContractSubmissionAgainstSchema } from '../src/services/validateContractSubmission.js';

const syntheticSchema: ContractSchemaDefinition = {
  schemaId: 'synthetic-v1',
  contractType: 'synthetic-v1',
  sections: [
    {
      title: 'Rules',
      fields: [
        { name: 'approved', label: 'Approved', type: 'boolean', required: true },
        {
          name: 'choice',
          label: 'Choice',
          type: 'select',
          required: true,
          options: ['one', 'two'],
        },
        {
          name: 'code',
          label: 'Code',
          type: 'string',
          required: true,
          pattern: '^[A-Z]+$',
          maxLength: 3,
        },
        { name: 'amount', label: 'Amount', type: 'number', required: true, max: 10 },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'date', label: 'Date', type: 'date', required: true },
      ],
    },
  ],
  columnMap: {
    approved: 'Approved',
    choice: 'Choice',
    code: 'Code',
    amount: 'Amount',
    email: 'Email',
    date: 'Date',
  },
};

function request(fields: ContractSubmissionRequest['fields']): ContractSubmissionRequest {
  return {
    schemaId: syntheticSchema.schemaId,
    contractType: syntheticSchema.contractType,
    fields,
    meta: { userId: 'user-123', origin: 'api' },
  };
}

test('schema-injected validator covers all field types and accepts required false', () => {
  const result = validateContractSubmissionAgainstSchema(
    request({
      approved: false,
      choice: 'two',
      code: 'ABC',
      amount: 10,
      email: 'person@example.com',
      date: '2028-02-29',
    }),
    syntheticSchema,
  );
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.fields.approved, false);
});

test('schema-injected validator enforces select, pattern, length, max, email, and date', () => {
  const result = validateContractSubmissionAgainstSchema(
    request({
      approved: true,
      choice: 'missing',
      code: 'abcd',
      amount: 11,
      email: 'invalid-email',
      date: '2027-02-29',
    }),
    syntheticSchema,
  );
  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(
      new Set(result.errors.map((issue) => issue.code)),
      new Set([
        'invalid_option',
        'max_length',
        'pattern',
        'max',
        'invalid_email',
        'invalid_date',
      ]),
    );
  }
});

test('schema-injected validator reports invalid pattern and select configuration', () => {
  const invalidSchema: ContractSchemaDefinition = {
    ...syntheticSchema,
    sections: [
      {
        title: 'Invalid rules',
        fields: [
          {
            name: 'choice',
            label: 'Choice',
            type: 'select',
            required: true,
            options: [],
          },
          {
            name: 'code',
            label: 'Code',
            type: 'string',
            required: true,
            pattern: '[',
          },
        ],
      },
    ],
    columnMap: { choice: 'Choice', code: 'Code' },
  };
  const result = validateContractSubmissionAgainstSchema(
    request({ choice: 'one', code: 'ABC' }),
    invalidSchema,
  );
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(
      result.errors.filter((issue) => issue.code === 'invalid_schema').length,
      2,
    );
  }
});
