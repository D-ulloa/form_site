// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentProvider } from '../app/contexts/AgentContext.tsx';
import {
  fetchContractRoleSchema,
  submitContractRole,
} from '../features/contracts/services/contractApi.ts';
import type {
  ContractRoleSchemaResponse,
} from '../features/contracts/types.ts';
import { ContractFormPage } from './ContractFormPage.tsx';

vi.mock('../features/contracts/services/contractApi.ts', () => ({
  ContractRequestError: class ContractRequestError extends Error {
    fieldErrors = [];
  },
  fetchContractRoleSchema: vi.fn(),
  submitContractRole: vi.fn(),
}));

const entry = {
  entryId: '11111111-1111-4111-8111-111111111111',
  schemaId: 'rent-contract-v1',
  createdBy: 'agent-001',
  createdAt: '2026-07-29T12:00:00.000Z',
  userFilled: false,
  clientFilled: false,
  userSubmittedAt: null,
  clientSubmittedAt: null,
  status: 'open' as const,
  archivedAt: null,
};

const contractSection = {
  title: 'Contrato',
  fields: [
    { name: 'contract_object', label: '1ra. Objeto', type: 'string', required: true },
    { name: 'contract_months', label: 'meses', type: 'number', required: true },
    { name: 'contract_start_date', label: 'Inicio', type: 'date', required: true },
    {
      name: 'contract_formatted_start',
      label: 'Formateada_1',
      type: 'date',
      required: true,
      readOnly: true,
      computed: 'formatted_start',
    },
    { name: 'contract_rent_amount', label: 'Monto alquiler', type: 'number', required: true },
    { name: 'contract_update', label: 'Actualización', type: 'number', required: false },
    {
      name: 'contract_formatted_update',
      label: 'Formateada_2',
      type: 'date',
      required: false,
      readOnly: true,
      computed: 'formatted_update',
    },
    {
      name: 'contract_selection',
      label: 'Ajuste',
      type: 'select',
      required: false,
      options: ['IPC', 'IPL'],
    },
    { name: 'submission_date', label: 'Fecha Actual', type: 'date', required: true },
  ],
  subsections: [
    {
      title: 'Vigencia',
      fieldNames: [
        'contract_months',
        'contract_start_date',
        'contract_formatted_start',
      ],
    },
    {
      title: 'Canon',
      fieldNames: [
        'contract_rent_amount',
        'contract_update',
        'contract_formatted_update',
      ],
    },
    {
      title: 'Ajuste',
      fieldNames: ['contract_selection', 'submission_date'],
    },
  ],
} satisfies ContractRoleSchemaResponse['sections'][number];

function renderPage(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/contracts/:entryId/:role"
              element={<ContractFormPage />}
            />
          </Routes>
        </MemoryRouter>
      </AgentProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.mocked(submitContractRole).mockResolvedValue({
    submissionId: '22222222-2222-4222-8222-222222222222',
    entryId: entry.entryId,
    status: 'open',
    submittedAt: '2026-07-29T12:05:00.000Z',
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe('SPEC-12 hosted contract forms', () => {
  it('shows Propietario and Guardar without exposing the JSON schema', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'user',
      sections: [{
        title: 'Propietario',
        fields: [{
          name: 'witness_full_name',
          label: 'Nombre completo',
          type: 'string',
          required: true,
        }],
      }],
      entry,
      readOnly: false,
      values: {},
    } satisfies ContractRoleSchemaResponse);

    renderPage(`/contracts/${entry.entryId}/user`);

    expect(await screen.findByText('Propietario')).toBeTruthy();
    expect(screen.getByText('Generación de contratos')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy();
    expect(screen.queryByText('Enviar formulario')).toBeNull();
    expect(screen.queryByText('Esquema JSON')).toBeNull();
  });

  it('groups the editable Contrato fields under the three SPEC-13 subdivisions', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'user',
      sections: [contractSection],
      entry,
      readOnly: false,
      values: {},
    } satisfies ContractRoleSchemaResponse);

    renderPage(`/contracts/${entry.entryId}/user`);

    const vigencia = await screen.findByRole('group', { name: 'Vigencia' });
    const canon = screen.getByRole('group', { name: 'Canon' });
    const ajuste = screen.getByRole('group', { name: 'Ajuste' });

    expect(within(vigencia).getByLabelText(/^meses/u)).toBeTruthy();
    expect(within(vigencia).getByLabelText(/^Inicio/u)).toBeTruthy();
    expect(within(vigencia).getByLabelText(/^Formateada_1/u)).toHaveProperty('readOnly', true);
    expect(within(canon).getByLabelText(/^Monto alquiler/u)).toBeTruthy();
    expect(within(canon).getByLabelText('Actualización')).toBeTruthy();
    expect(within(canon).getByLabelText('Formateada_2')).toHaveProperty('readOnly', true);
    expect(within(ajuste).getByLabelText('Ajuste')).toBeTruthy();
    expect(within(ajuste).getByLabelText(/^Fecha Actual/u)).toBeTruthy();

    const contractObject = screen.getByLabelText(/^1ra\. Objeto/u);
    expect(contractObject).toBeTruthy();
    expect(vigencia.contains(contractObject)).toBe(false);
    expect(canon.contains(contractObject)).toBe(false);
    expect(ajuste.contains(contractObject)).toBe(false);
  });

  it('preserves the Contrato subdivisions when a submitted form is read-only', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'user',
      sections: [contractSection],
      entry: { ...entry, userFilled: true },
      readOnly: true,
      values: {
        contract_object: 'Vivienda',
        contract_months: 24,
        contract_start_date: '2026-08-15',
        contract_formatted_start: '2026-07-31',
        contract_rent_amount: 500000,
        contract_update: 6,
        contract_formatted_update: '2027-01-31',
        contract_selection: 'IPC',
        submission_date: '2026-07-29',
      },
    } satisfies ContractRoleSchemaResponse);

    renderPage(`/contracts/${entry.entryId}/user`);

    expect(await screen.findByRole('region', { name: 'Vigencia' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Canon' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Ajuste' })).toBeTruthy();
    expect(screen.getByText('Vivienda')).toBeTruthy();
    expect(screen.getByText('2027-01-31')).toBeTruthy();
  });

  it('blocks a guarantor with both subsections empty and accepts either one', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'client',
      sections: [{
        title: 'Garantes',
        fields: [
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
        repeatable: {
          name: 'garantes',
          itemLabel: 'Garante',
          addLabel: 'Agregar Garante',
          minItems: 1,
        },
        subsections: [
          {
            title: 'Recibo de sueldo',
            fieldNames: ['guarantor_company'],
          },
          {
            title: 'Garantía propietaria',
            fieldNames: ['property_type'],
          },
        ],
      }],
      entry,
      readOnly: false,
      values: {},
    } satisfies ContractRoleSchemaResponse);

    renderPage(`/contracts/${entry.entryId}/client?token=client-token`);

    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText(
        'Completá al menos Recibo de sueldo o Garantía propietaria.',
      ),
    ).toBeTruthy();
    expect(submitContractRole).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Empresa'), {
      target: { value: 'Empresa SA' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(submitContractRole).toHaveBeenCalledWith(
        entry.entryId,
        'client',
        'client-token',
        { garantes: [{ guarantor_company: 'Empresa SA' }] },
        undefined,
      );
    });
  });
});
