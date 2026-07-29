// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createContractEntry } from '../services/contractApi.ts';
import { ContractEntryModal } from './ContractEntryModal.tsx';

vi.mock('../services/contractApi.ts', () => ({
  createContractEntry: vi.fn(),
}));

const clipboardWriteText = vi.fn<(text: string) => Promise<void>>();

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWriteText },
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  clipboardWriteText.mockReset().mockResolvedValue(undefined);
  vi.mocked(createContractEntry).mockResolvedValue({
    entryId: '11111111-1111-4111-8111-111111111111',
    userUrl: 'https://contracts.example.test/contracts/entry/user?token=user-token',
    clientUrl: 'https://contracts.example.test/contracts/entry/client?token=client-token',
    createdAt: '2026-07-29T12:00:00.000Z',
    status: 'open',
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ContractEntryModal open userId="agent-001" onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SPEC-12 contract generation actions', () => {
  it('shows only the definitive Spanish actions and removes technical copy', async () => {
    renderModal();

    expect(await screen.findByText('Esperando ambos formularios')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Abrir info del contrato' }),
    ).toBeTruthy();
    const clientButton = screen.getByRole('button', {
      name: 'Formulario del cliente',
    });
    expect(clientButton).toBeTruthy();
    expect(
      screen.queryByText('Creamos dos formularios privados y alojados en este sitio.'),
    ).toBeNull();
    expect(screen.queryByText(/credenciales de acceso/i)).toBeNull();

    fireEvent.click(clientButton);
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        'https://contracts.example.test/contracts/entry/client?token=client-token',
      );
    });
    expect(screen.getByText('Enlace copiado')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Formulario del cliente' }),
    ).toBeTruthy();
  });
});
