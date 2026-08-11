import assert from 'node:assert/strict';
import test from 'node:test';
import { getContractRoleSchema } from '../../src/config/contractSchemas.js';
import type {
  ContractEntryRecord,
  ContractFieldDefinition,
  ContractFieldValue,
} from '../../src/contracts/types.js';
import { validateContractRoleSubmissionFields } from '../../src/services/validateContractRoleSubmission.js';

const ENTRY: ContractEntryRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  schemaId: 'rent-contract-v1',
  createdBy: 'agent-001',
  createdAt: '2026-07-29T12:00:00.000Z',
  userTokenHash: 'user-token-hash',
  clientTokenHash: 'client-token-hash',
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
  return Object.fromEntries(
    fields
      .filter((field) => field.required && !field.computed)
      .map((field) => [field.name, valueFor(field)]),
  );
}

function evidenceReference() {
  const storagePath = `contracts/${ENTRY.id}/client/garantes/0/`
    + 'recibo_sueldo_files/22222222-2222-4222-8222-222222222222-recibo.pdf';
  return {
    filename: 'recibo.pdf',
    mimeType: 'application/pdf',
    size: 1000,
    storagePath,
    storageBucket: 'contract-evidence',
  };
}

function clientFields(guarantorFields: Record<string, unknown>) {
  const schema = getContractRoleSchema('rent-contract-v1', 'client');
  const tenantSection = schema.sections.find(
    (section) => section.repeatable?.name === 'inquilinos',
  );
  const guarantorSection = schema.sections.find(
    (section) => section.repeatable?.name === 'garantes',
  );
  assert.ok(tenantSection);
  assert.ok(guarantorSection);

  return {
    inquilinos: [requiredFields(tenantSection.fields)],
    garantes: [{
      ...requiredFields(guarantorSection.fields),
      recibo_sueldo_files: [evidenceReference()],
      ...guarantorFields,
    }],
  };
}

test('SPEC-12 schema exposes Propietario and the two guarantor subsections', () => {
  const client = getContractRoleSchema('rent-contract-v1', 'client');
  const user = getContractRoleSchema('rent-contract-v1', 'user');
  const guarantors = client.sections.find(
    (section) => section.repeatable?.name === 'garantes',
  );

  assert.deepEqual(user.sections.map((section) => section.title), [
    'Propietario',
    'Contrato',
  ]);
  assert.deepEqual(guarantors?.subsections?.map(({ title, fieldNames }) => ({
    title,
    fieldNames,
  })), [
    {
      title: 'Recibo de sueldo',
      fieldNames: [
        'guarantor_company',
        'guarantor_cuit',
        'guarantor_position',
        'guarantor_employee_id',
        'guarantor_company_registration',
      ],
    },
    {
      title: 'Garantía propietaria',
      fieldNames: [
        'property_registration_number',
        'property_province',
        'property_address',
        'property_type',
      ],
    },
  ]);
  assert.equal(
    guarantors?.fields.find((field) => field.name === 'property_type')?.label,
    'Tipo de propiedad',
  );
});

test('SPEC-12 accepts either guarantor subsection or both, but rejects neither', () => {
  const roleSchema = getContractRoleSchema('rent-contract-v1', 'client');

  for (const guarantorFields of [
    { guarantor_company: 'Empresa SA' },
    { property_type: 'Casa' },
    {
      guarantor_company: 'Empresa SA',
      property_type: 'Departamento',
    },
  ]) {
    const result = validateContractRoleSubmissionFields({
      entry: ENTRY,
      role: 'client',
      roleSchema,
      fields: clientFields(guarantorFields),
    });
    assert.equal(result.success, true);
  }

  const missing = validateContractRoleSubmissionFields({
    entry: ENTRY,
    role: 'client',
    roleSchema,
    fields: clientFields({}),
  });
  assert.equal(missing.success, false);
  if (!missing.success) {
    assert.ok(missing.errors.some((error) =>
      error.path === 'fields.garantes.0._subsections' &&
      error.message === 'Completá al menos Recibo de sueldo o Garantía propietaria.'));
  }
});
