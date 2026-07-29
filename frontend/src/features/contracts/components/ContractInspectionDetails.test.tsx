// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import * as axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  ContractEntryInspection,
  ContractInspectionSubmission,
} from '../types.ts';
import { ContractInspectionDetails } from './ContractInspectionDetails.tsx';

afterEach(cleanup);

const userSubmission: ContractInspectionSubmission = {
  submissionId: '11111111-1111-4111-8111-111111111111',
  role: 'user',
  submittedAt: '2026-07-29T13:00:00.000Z',
  sections: [{
    title: 'Contrato',
    fields: [{
      name: 'contract_object',
      label: '1ra. Objeto',
      type: 'string',
      value: 'Vivienda',
    }],
    subsections: [{
      title: 'Vigencia',
      fields: [{
        name: 'contract_months',
        label: 'meses',
        type: 'number',
        value: 24,
      }],
      media: [],
    }],
    items: [],
  }],
};

const clientSubmission: ContractInspectionSubmission = {
  submissionId: '22222222-2222-4222-8222-222222222222',
  role: 'client',
  submittedAt: '2026-07-29T12:00:00.000Z',
  sections: [{
    title: 'Inquilino',
    fields: [],
    subsections: [],
    items: [{
      index: 0,
      label: 'Inquilino 1',
      fields: [{
        name: 'tenant_full_name',
        label: 'Nombre completo',
        type: 'string',
        value: 'Ana Pérez',
      }],
      subsections: [],
      media: [{
        fieldName: 'tenant_dni_front_image',
        label: 'Frente DNI',
        slot: 'front',
        originalName: 'dni-frente.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        viewUrl: 'https://storage.example.test/signed/dni-front',
        expiresAt: '2026-07-29T13:15:00.000Z',
      }],
    }],
  }, {
    title: 'Garantes',
    fields: [],
    subsections: [],
    items: [{
      index: 0,
      label: 'Garante 1',
      fields: [],
      subsections: [{
        title: 'Recibo de sueldo',
        fields: [],
        media: [{
          fieldName: 'recibo_sueldo_files',
          label: 'Subir recibo de sueldo',
          filename: 'recibo.png',
          mimeType: 'image/png',
          size: 4096,
          viewUrl: 'https://storage.example.test/signed/receipt',
          expiresAt: '2026-07-29T13:15:00.000Z',
        }],
      }, {
        title: 'Garantía propietaria',
        fields: [],
        media: [{
          fieldName: 'garantia_propietaria_files',
          label: 'Subir garantía propietaria',
          filename: 'titulo.pdf',
          mimeType: 'application/pdf',
          size: 8192,
          viewUrl: 'https://storage.example.test/signed/deed',
          expiresAt: '2026-07-29T13:15:00.000Z',
        }],
      }],
      media: [],
    }],
  }],
};

function inspection(
  submissions: ContractInspectionSubmission[],
): ContractEntryInspection {
  return {
    hasSubmissions: submissions.length > 0,
    submissions,
  };
}

describe('SPEC-13 contract inspection details', () => {
  it('shows both forms in response order with structured values, timestamps, and media', () => {
    const { container } = render(
      <ContractInspectionDetails inspection={inspection([
        userSubmission,
        clientSubmission,
      ])} />,
    );

    const roles = Array.from(
      container.querySelectorAll<HTMLElement>('[data-inspection-role]'),
    ).map((element) => element.dataset.inspectionRole);
    expect(roles).toEqual(['user', 'client']);
    expect(screen.getByRole('heading', { name: 'Detalles del contrato' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Formulario del usuario' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Formulario del cliente' })).toBeTruthy();
    expect(screen.getByText('Vivienda')).toBeTruthy();
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.getAllByText(/^Enviado:/u)).toHaveLength(2);
    expect(screen.getByRole('img', {
      name: 'Frente DNI: dni-frente.jpg',
    })).toHaveProperty(
      'src',
      'https://storage.example.test/signed/dni-front',
    );
    expect(screen.getByRole('link', {
      name: 'Ver Frente DNI: dni-frente.jpg',
    })).toHaveProperty(
      'href',
      'https://storage.example.test/signed/dni-front',
    );
  });

  it.each([
    ['user', userSubmission, 'Formulario del usuario', 'Formulario del cliente'],
    ['client', clientSubmission, 'Formulario del cliente', 'Formulario del usuario'],
  ])(
    'shows only the %s form for a partial submission',
    (_role, submission, visibleHeading, omittedHeading) => {
      render(
        <ContractInspectionDetails inspection={inspection([submission])} />,
      );

      expect(screen.getByRole('heading', { name: visibleHeading })).toBeTruthy();
      expect(screen.queryByRole('heading', { name: omittedHeading })).toBeNull();
      expect(screen.queryByText('No hay datos de formulario enviados')).toBeNull();
    },
  );

  it('shows a clear empty state without rendering contract fields', () => {
    const { container } = render(
      <ContractInspectionDetails inspection={inspection([])} />,
    );

    expect(screen.getByText('No hay datos de formulario enviados')).toBeTruthy();
    expect(container.querySelector('[data-inspection-field]')).toBeNull();
    expect(container.querySelector('[data-inspection-media]')).toBeNull();
  });

  it('groups SPEC-14 image and PDF evidence with the corresponding subsection', () => {
    render(
      <ContractInspectionDetails inspection={inspection([clientSubmission])} />,
    );

    const salary = screen.getByRole('region', { name: 'Recibo de sueldo' });
    const property = screen.getByRole('region', { name: 'Garantía propietaria' });

    expect(within(salary).getByRole('img', {
      name: 'Subir recibo de sueldo: recibo.png',
    })).toHaveProperty('src', 'https://storage.example.test/signed/receipt');
    expect(within(salary).getByRole('link', {
      name: 'Ver Subir recibo de sueldo: recibo.png',
    })).toHaveProperty('href', 'https://storage.example.test/signed/receipt');
    expect(within(property).getByLabelText('Archivo PDF: titulo.pdf')).toBeTruthy();
    expect(within(property).getByRole('link', {
      name: 'Ver Subir garantía propietaria: titulo.pdf',
    })).toHaveProperty('href', 'https://storage.example.test/signed/deed');
  });

  it('has no axe violations in populated or empty inspection states', async () => {
    const { container, rerender } = render(
      <ContractInspectionDetails inspection={inspection([
        userSubmission,
        clientSubmission,
      ])} />,
    );

    const populatedResults = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(populatedResults.violations).toEqual([]);

    rerender(<ContractInspectionDetails inspection={inspection([])} />);
    const emptyResults = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(emptyResults.violations).toEqual([]);
  });
});
