// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
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
