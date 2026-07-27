// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import type { ContractFormValues, ContractSection } from '../types.ts';
import {
  buildContractDefaultValues,
  normalizeContractRoleFields,
} from '../types.ts';
import {
  computeFormattedStart,
  computeFormattedUpdate,
} from '../utils/contractComputedDates.ts';
import {
  ContractRepeatableSection,
} from './ContractRepeatableSection.tsx';

afterEach(cleanup);

const tenantSection: ContractSection = {
  title: 'Inquilino',
  repeatable: {
    name: 'inquilinos',
    itemLabel: 'Inquilino',
    addLabel: 'Agregar Inquilino',
    minItems: 1,
  },
  fields: [
    {
      name: 'tenant_full_name',
      label: 'Nombre completo',
      type: 'string',
      required: true,
    },
    {
      name: 'tenant_email',
      label: 'Correo',
      type: 'email',
      required: true,
    },
  ],
  uploads: [
    {
      name: 'tenant_dni_front_image',
      label: 'Frente DNI',
      slot: 'front',
      required: false,
    },
    {
      name: 'tenant_dni_back_image',
      label: 'Dorso DNI',
      slot: 'back',
      required: false,
    },
  ],
};

function RepeatableHarness() {
  const form = useForm<ContractFormValues>({
    defaultValues: buildContractDefaultValues({ sections: [tenantSection] }),
  });
  return (
    <form aria-label="Formulario repetible">
      <ContractRepeatableSection
        section={tenantSection}
        form={form}
        entryId="11111111-1111-4111-8111-111111111111"
        token="client-token"
        onUploadPendingChange={() => undefined}
      />
    </form>
  );
}

describe('SPEC-11 repeatable contract sections', () => {
  it('starts with one block, adds/removes blocks, and keeps both DNI slots per block', async () => {
    const { container } = render(<RepeatableHarness />);

    expect(screen.getAllByRole('heading', { name: /Inquilino 1/ })).toHaveLength(1);
    expect(screen.getAllByLabelText('Frente DNI')).toHaveLength(1);
    expect(screen.getAllByLabelText('Dorso DNI')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar Inquilino' }));
    expect(screen.getByRole('heading', { name: /Inquilino 2/ })).toBeTruthy();
    expect(screen.getAllByLabelText('Frente DNI')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Quitar' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[0]);
    expect(screen.queryByRole('heading', { name: /Inquilino 2/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull();

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('normalizes repeated items as arrays and retains only the two configured image slots', () => {
    const first = {
      tenant_full_name: '  Garcia, Juan  ',
      tenant_email: 'juan@example.com',
      tenant_dni_front_image: { storagePath: 'front' },
      tenant_dni_back_image: { storagePath: 'back' },
      ignored: 'value',
    };
    const normalized = normalizeContractRoleFields(
      { sections: [tenantSection] },
      { inquilinos: [first, { ...first, tenant_full_name: 'Perez, Ana' }] },
    );

    expect(normalized).toEqual({
      inquilinos: [
        {
          tenant_full_name: 'Garcia, Juan',
          tenant_email: 'juan@example.com',
          tenant_dni_front_image: { storagePath: 'front' },
          tenant_dni_back_image: { storagePath: 'back' },
        },
        {
          tenant_full_name: 'Perez, Ana',
          tenant_email: 'juan@example.com',
          tenant_dni_front_image: { storagePath: 'front' },
          tenant_dni_back_image: { storagePath: 'back' },
        },
      ],
    });
  });

  it('computes read-only contract dates with calendar-safe month ends', () => {
    expect(computeFormattedStart('2028-03-01')).toBe('2028-02-29');
    expect(computeFormattedStart('2027-03-01')).toBe('2027-02-28');
    expect(computeFormattedUpdate('2026-07-31', 6)).toBe('2027-01-31');
    expect(computeFormattedUpdate('2026-07-31', 0)).toBe('2026-07-31');
    expect(computeFormattedUpdate('2026-07-31', '')).toBe('');
  });
});
