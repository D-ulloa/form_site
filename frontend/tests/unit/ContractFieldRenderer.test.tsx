// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import * as axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import {
  buildContractDefaultValues,
  normalizeContractFields,
  type ContractField,
  type ContractFormValues,
  type ContractPublicSchema,
} from '../../src/features/contracts/types.ts';
import {
  ContractFieldRenderer,
  getContractFieldRules,
  isValidContractDate,
  validateContractField,
} from '../../src/features/contracts/components/ContractFieldRenderer.tsx';

afterEach(cleanup);

function makeField(overrides: Partial<ContractField> = {}): ContractField {
  return {
    name: 'field_name',
    label: 'Campo',
    type: 'string',
    required: true,
    ...overrides,
  };
}

const allFieldTypes: ContractField[] = [
  makeField({ name: 'text_value', label: 'Texto', type: 'string' }),
  makeField({ name: 'email_value', label: 'Correo', type: 'email' }),
  makeField({ name: 'number_value', label: 'Número', type: 'number', min: 0, max: 10 }),
  makeField({ name: 'date_value', label: 'Fecha', type: 'date' }),
  makeField({ name: 'boolean_value', label: 'Aprobado', type: 'boolean' }),
  makeField({
    name: 'select_value',
    label: 'Selección',
    type: 'select',
    options: ['Uno', { value: 'two', label: 'Dos' }],
  }),
];

const schema: ContractPublicSchema = {
  schemaId: 'rent-contract-v1-schema',
  contractType: 'rent-contract-v1',
  googleFormLink: 'https://forms.gle/example',
  sections: [{ title: 'Campos', fields: allFieldTypes }],
};

describe('contract field helpers', () => {
  it('validates real ISO calendar dates', () => {
    expect(isValidContractDate('2028-02-29')).toBe(true);
    expect(isValidContractDate('2027-02-29')).toBe(false);
    expect(isValidContractDate('08/01/2026')).toBe(false);
  });

  it.each([
    ['string', allFieldTypes[0], 'Texto válido'],
    ['email', allFieldTypes[1], 'persona@example.com'],
    ['number', allFieldTypes[2], 5],
    ['date', allFieldTypes[3], '2026-08-01'],
    ['boolean false', allFieldTypes[4], false],
    ['select', allFieldTypes[5], 'two'],
  ])('accepts a valid %s value', (_label, field, value) => {
    expect(validateContractField(field, value)).toBe(true);
  });

  it('enforces required, format, range, pattern, length, and options rules', () => {
    expect(validateContractField(allFieldTypes[0], '')).toContain('requerido');
    expect(validateContractField(allFieldTypes[1], 'not-an-email')).toContain('correo válido');
    expect(validateContractField(allFieldTypes[2], -1)).toContain('mayor o igual');
    expect(validateContractField(allFieldTypes[2], 11)).toContain('menor o igual');
    expect(validateContractField(
      makeField({ type: 'number', integer: true }),
      1.5,
    )).toContain('entero');
    expect(validateContractField(allFieldTypes[3], '2026-02-30')).toContain('fecha válida');
    expect(validateContractField(allFieldTypes[5], 'missing')).toContain('opciones');

    const constrained = makeField({ pattern: '^[A-Z]+$', maxLength: 3 });
    expect(validateContractField(constrained, 'abcd')).toContain('caracteres');
    expect(validateContractField(constrained, 'abc')).toContain('formato');
  });

  it('normalizes number registration values while preserving empty inputs', () => {
    const rules = getContractFieldRules(allFieldTypes[2]);
    expect(rules.setValueAs?.('4.5')).toBe(4.5);
    expect(rules.setValueAs?.('')).toBe('');
    expect(typeof rules.validate).toBe('function');
  });

  it('builds defaults and normalizes a submission payload', () => {
    expect(buildContractDefaultValues(schema)).toEqual({
      text_value: '',
      email_value: '',
      number_value: '',
      date_value: '',
      boolean_value: false,
      select_value: '',
    });

    const optionalNumberSchema: ContractPublicSchema = {
      ...schema,
      sections: [
        {
          title: 'Campos',
          fields: [
            makeField({ name: 'name', label: 'Nombre' }),
            makeField({ name: 'months', label: 'Meses', type: 'number' }),
            makeField({ name: 'optional_amount', type: 'number', required: false }),
            makeField({ name: 'approved', type: 'boolean' }),
          ],
        },
      ],
    };

    expect(
      normalizeContractFields(optionalNumberSchema, {
        name: '  Ada Lovelace  ',
        months: '24',
        optional_amount: '',
        approved: false,
      }),
    ).toEqual({ name: 'Ada Lovelace', months: 24, approved: false });
  });
});

function AllContractControls() {
  const { register } = useForm<ContractFormValues>({
    defaultValues: buildContractDefaultValues(schema),
  });

  return (
    <main>
      <form aria-label="Campos del contrato">
        {allFieldTypes.map((field) => (
          <ContractFieldRenderer key={field.name} field={field} register={register} />
        ))}
      </form>
    </main>
  );
}

describe('ContractFieldRenderer accessibility', () => {
  it('renders all six supported controls with labels and no axe violations', async () => {
    const { container } = render(<AllContractControls />);

    expect((screen.getByLabelText(/^Texto/) as HTMLInputElement).type).toBe('text');
    expect((screen.getByLabelText(/^Correo/) as HTMLInputElement).type).toBe('email');
    expect((screen.getByLabelText(/^Número/) as HTMLInputElement).type).toBe('number');
    expect((screen.getByLabelText(/^Fecha/) as HTMLInputElement).type).toBe('date');
    expect((screen.getByLabelText('Aprobado') as HTMLInputElement).type).toBe('checkbox');
    expect(screen.getByLabelText(/^Selección/).tagName).toBe('SELECT');

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('renders Ajuste as IPC/ICL only and computed dates as readonly inputs', () => {
    const specFields: ContractField[] = [
      makeField({
        name: 'contract_selection',
        label: 'Ajuste',
        type: 'select',
        required: false,
        options: ['IPC', 'ICL'],
      }),
      makeField({
        name: 'contract_formatted_start',
        label: 'Formateada_1',
        type: 'date',
        readOnly: true,
        computed: 'formatted_start',
      }),
      makeField({
        name: 'contract_formatted_update',
        label: 'Formateada_2',
        type: 'date',
        required: false,
        readOnly: true,
        computed: 'formatted_update',
      }),
    ];

    function SpecControls() {
      const { register } = useForm<ContractFormValues>({
        defaultValues: {
          contract_selection: '',
          contract_formatted_start: '2026-07-31',
          contract_formatted_update: '2027-01-31',
        },
      });
      return specFields.map((field) => (
        <ContractFieldRenderer key={field.name} field={field} register={register} />
      ));
    }

    render(<SpecControls />);
    const adjustment = screen.getByLabelText(/^Ajuste/) as HTMLSelectElement;
    expect(Array.from(adjustment.options).map((option) => option.value)).toEqual(['', 'IPC', 'ICL']);
    expect((screen.getByLabelText(/^Formateada_1/) as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText(/^Formateada_2/) as HTMLInputElement).readOnly).toBe(true);
  });
});
