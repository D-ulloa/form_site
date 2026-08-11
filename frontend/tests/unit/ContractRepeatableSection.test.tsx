// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import * as axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useForm } from 'react-hook-form';
import type { ContractFormValues, ContractSection } from '../../src/features/contracts/types.ts';
import {
  buildContractDefaultValues,
  getMissingContractEvidence,
  getMissingContractSubsections,
  normalizeContractRoleFields,
} from '../../src/features/contracts/types.ts';
import {
  computeFormattedStart,
  computeFormattedUpdate,
} from '../../src/features/contracts/utils/contractComputedDates.ts';
import {
  ContractRepeatableSection,
} from '../../src/features/contracts/components/ContractRepeatableSection.tsx';

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

const guarantorSection: ContractSection = {
  title: 'Garantes',
  repeatable: {
    name: 'garantes',
    itemLabel: 'Garante',
    addLabel: 'Agregar Garante',
    minItems: 1,
  },
  fields: [
    {
      name: 'guarantor_full_name',
      label: 'Nombre completo',
      type: 'string',
      required: true,
    },
    {
      name: 'guarantor_company',
      label: 'Empresa',
      type: 'string',
      required: false,
    },
    {
      name: 'property_type',
      label: 'Tipo de propiedad',
      type: 'string',
      required: false,
    },
  ],
  uploads: [
    {
      name: 'guarantor_dni_front_image',
      label: 'Frente DNI',
      slot: 'front',
      required: false,
    },
    {
      name: 'guarantor_dni_back_image',
      label: 'Dorso DNI',
      slot: 'back',
      required: false,
    },
  ],
  subsections: [
    {
      title: 'Recibo de sueldo',
      fieldNames: ['guarantor_company'],
      fileReceivers: [{
        name: 'recibo_sueldo_files',
        label: 'Subir recibo de sueldo',
        maxFiles: 2,
        maxSizeBytes: 10 * 1024 * 1024,
        acceptedMimeTypes: [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'image/bmp',
          'image/tiff',
        ],
      }],
    },
    {
      title: 'Garantía propietaria',
      fieldNames: ['property_type'],
      fileReceivers: [{
        name: 'garantia_propietaria_files',
        label: 'Subir garantía propietaria',
        maxFiles: 2,
        maxSizeBytes: 10 * 1024 * 1024,
        acceptedMimeTypes: [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'image/bmp',
          'image/tiff',
        ],
      }],
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

function GuarantorHarness() {
  const form = useForm<ContractFormValues>({
    defaultValues: buildContractDefaultValues({ sections: [guarantorSection] }),
  });
  return (
    <form aria-label="Formulario de garantes">
      <ContractRepeatableSection
        section={guarantorSection}
        form={form}
        entryId="11111111-1111-4111-8111-111111111111"
        token="client-token"
        onUploadPendingChange={() => undefined}
      />
    </form>
  );
}

function NestedEvidenceErrorHarness() {
  const form = useForm<ContractFormValues>({
    defaultValues: buildContractDefaultValues({ sections: [guarantorSection] }),
  });
  return (
    <>
      <button
        type="button"
        onClick={() => form.setError('garantes.0.recibo_sueldo_files.0', {
          type: 'server',
          message: 'El archivo no pertenece a esta entrada.',
        })}
      >
        Mostrar error anidado
      </button>
      <ContractRepeatableSection
        section={guarantorSection}
        form={form}
        entryId="11111111-1111-4111-8111-111111111111"
        token="client-token"
        onUploadPendingChange={() => undefined}
      />
    </>
  );
}

describe('SPEC-11 repeatable contract sections', () => {
  it('starts with one block, adds/removes blocks, and keeps both DNI slots per block', async () => {
    const { container } = render(<RepeatableHarness />);

    expect(screen.getAllByRole('heading', { name: /Inquilino 1/ })).toHaveLength(1);
    expect(screen.getAllByLabelText('Frente DNI')).toHaveLength(1);
    expect(screen.getAllByLabelText('Dorso DNI')).toHaveLength(1);
    expect(screen.getAllByText('Seleccionar archivo')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar Inquilino' }));
    expect(screen.getByRole('heading', { name: /Inquilino 2/ })).toBeTruthy();
    expect(screen.getAllByLabelText('Frente DNI')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Eliminar' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);
    expect(screen.queryByRole('heading', { name: /Inquilino 2/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('SPEC-20 focuses and scrolls each newly added repeated block', () => {
    const scrollTargets: HTMLElement[] = [];
    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      scrollTargets.push(this);
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    render(<RepeatableHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Inquilino' }));
    const tenantBlock = screen.getByRole('heading', { name: /Inquilino 2/u }).closest('[data-repeatable-item]');
    expect(tenantBlock).toBeTruthy();
    const tenantInput = within(tenantBlock as HTMLElement).getByLabelText(/^Nombre completo/u);
    expect(document.activeElement).toBe(tenantInput);

    cleanup();
    render(<GuarantorHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Garante' }));
    const guarantorBlock = screen.getByRole('heading', { name: /Garante 2/u }).closest('[data-repeatable-item]');
    expect(guarantorBlock).toBeTruthy();
    expect(document.activeElement).toBe(
      within(guarantorBlock as HTMLElement).getByLabelText(/^Nombre completo/u),
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollTargets[1]).toBe(
      within(guarantorBlock as HTMLElement)
        .getByRole('textbox', { name: /^Nombre completo/u })
        .closest('[data-repeatable-personal-data="garantes"]'),
    );
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: undefined,
    });
  });

  it('SPEC-20 places guarantor DNI controls before guarantee subsections', () => {
    render(<GuarantorHarness />);
    const guarantorBlock = screen.getByRole('heading', { name: /Garante 1/u }).closest('[data-repeatable-item]');
    expect(guarantorBlock).toBeTruthy();
    const block = guarantorBlock as HTMLElement;
    const personalField = within(block).getByLabelText(/^Nombre completo/u);
    const dniField = within(block).getByLabelText('Frente DNI');
    const guarantee = within(block).getByRole('region', { name: 'Recibo de sueldo' });

    expect(personalField.compareDocumentPosition(dniField) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(dniField.compareDocumentPosition(guarantee) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
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
    expect(computeFormattedStart('2031-03-01')).toBe('2031-02-28');
    expect(computeFormattedUpdate('2026-07-31', 6)).toBe('2027-01-31');
    expect(computeFormattedUpdate('2029-12-31', 1)).toBe('2030-01-31');
    expect(computeFormattedUpdate('2026-07-31', 0)).toBe('2026-07-31');
    expect(computeFormattedUpdate('2026-07-31', '')).toBe('');
  });
});

describe('SPEC-12 guarantor subsections', () => {
  it('groups guarantor fields under the two Spanish subsection headings', () => {
    render(<GuarantorHarness />);

    const salary = screen.getByRole('region', { name: 'Recibo de sueldo' });
    const property = screen.getByRole('region', { name: 'Garantía propietaria' });
    expect(within(salary).getByLabelText('Empresa')).toBeTruthy();
    expect(within(salary).getByLabelText('Subir recibo de sueldo')).toBeTruthy();
    expect(within(property).getByLabelText('Tipo de propiedad')).toBeTruthy();
    expect(within(property).getByLabelText('Subir garantía propietaria')).toBeTruthy();
  });

  it('requires data in at least one guarantor subsection for every item', () => {
    const schema = { sections: [guarantorSection] };

    expect(getMissingContractSubsections(schema, {
      garantes: [{ guarantor_full_name: 'Perez, Ana' }],
    })).toEqual([{ collection: 'garantes', itemIndex: 0 }]);
    expect(getMissingContractSubsections(schema, {
      garantes: [{ guarantor_company: 'Empresa SA' }],
    })).toEqual([]);
    expect(getMissingContractSubsections(schema, {
      garantes: [{ property_type: 'Casa' }],
    })).toEqual([]);
    expect(getMissingContractSubsections(schema, {
      garantes: [
        { guarantor_company: 'Empresa SA' },
        { property_type: 'Departamento' },
        {},
      ],
    })).toEqual([{ collection: 'garantes', itemIndex: 2 }]);
  });

  it('requires at least one evidence file across both receivers for each guarantor', () => {
    const schema = { sections: [guarantorSection] };
    const receipt = new File(['receipt'], 'recibo.pdf', { type: 'application/pdf' });
    const property = new File(['deed'], 'titulo.png', { type: 'image/png' });

    expect(getMissingContractEvidence(schema, {
      garantes: [{}, { recibo_sueldo_files: [] }],
    })).toEqual([
      { collection: 'garantes', itemIndex: 0 },
      { collection: 'garantes', itemIndex: 1 },
    ]);
    expect(getMissingContractEvidence(schema, {
      garantes: [{ recibo_sueldo_files: [receipt] }],
    })).toEqual([]);
    expect(getMissingContractEvidence(schema, {
      garantes: [{ garantia_propietaria_files: [property] }],
    })).toEqual([]);
    expect(getMissingContractEvidence(schema, {
      garantes: [{
        recibo_sueldo_files: [receipt],
        garantia_propietaria_files: [property],
      }],
    })).toEqual([]);
  });

  it('retains stable evidence arrays while normalizing guarantor payloads', () => {
    const receipt = {
      filename: 'recibo.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      storagePath: 'entry/garantes/0/recibo.pdf',
      storageBucket: 'contract-evidence',
    };

    expect(normalizeContractRoleFields(
      { sections: [guarantorSection] },
      {
        garantes: [{
          guarantor_full_name: 'Pérez, Ana',
          guarantor_company: 'Empresa SA',
          recibo_sueldo_files: [receipt],
          ignored: 'value',
        }],
      },
    )).toEqual({
      garantes: [{
        guarantor_full_name: 'Pérez, Ana',
        guarantor_company: 'Empresa SA',
        recibo_sueldo_files: [receipt],
      }],
    });
  });

  it('surfaces a nested backend evidence error at the receiver root', () => {
    render(<NestedEvidenceErrorHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar error anidado' }));

    const salary = screen.getByRole('region', { name: 'Recibo de sueldo' });
    expect(within(salary).getByRole('alert').textContent).toContain(
      'El archivo no pertenece a esta entrada.',
    );
    expect(
      within(salary).getByLabelText('Subir recibo de sueldo')
        .getAttribute('aria-invalid'),
    ).toBe('true');
  });
});
