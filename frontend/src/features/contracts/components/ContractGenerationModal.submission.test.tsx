// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as axe from 'axe-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContractPublicSchema,
  ContractSubmitRequest,
  ContractSubmitResponse,
} from '../types.ts';
import { useContractSchema } from '../hooks/useContractSchema.ts';
import { useSubmitContract } from '../hooks/useSubmitContract.ts';
import { ContractRequestError } from '../services/contractApi.ts';
import { ContractGenerationModal } from './ContractGenerationModal.tsx';

vi.mock('../hooks/useContractSchema.ts', () => ({
  useContractSchema: vi.fn(),
}));

vi.mock('../hooks/useSubmitContract.ts', () => ({
  useSubmitContract: vi.fn(),
}));

interface MutationCallbacks {
  onSuccess?: (response: ContractSubmitResponse) => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
}

const schema: ContractPublicSchema = {
  schemaId: 'rent-contract-v1-schema',
  contractType: 'rent-contract-v1',
  googleFormLink: 'https://forms.gle/example-contract',
  sections: [
    {
      title: 'Inquilino',
      fields: [
        {
          name: 'tenant_name',
          label: 'Nombre del inquilino',
          type: 'string',
          required: true,
          maxLength: 120,
        },
      ],
    },
  ],
};

const clipboardWriteText = vi.fn<(text: string) => Promise<void>>();
const mutate = vi.fn<(
  request: ContractSubmitRequest,
  callbacks?: MutationCallbacks,
) => void>();

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
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
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
  mutate.mockReset();

  vi.mocked(useContractSchema).mockReturnValue({
    data: schema,
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useContractSchema>);

  vi.mocked(useSubmitContract).mockReturnValue({
    isPending: false,
    mutate,
    reset: vi.fn(),
  } as unknown as ReturnType<typeof useSubmitContract>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderStepB() {
  const view = render(
    <ContractGenerationModal open userId="agent-001" onClose={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
  const input = await screen.findByLabelText(/^Nombre del inquilino/);
  return { ...view, input: input as HTMLInputElement };
}

describe('ContractGenerationModal submission', () => {
  it('submits the exact normalized request once when Send is clicked twice', async () => {
    const { input } = await renderStepB();
    fireEvent.change(input, { target: { value: '  Ada Lovelace  ' } });

    const send = screen.getByRole('button', { name: 'Enviar' });
    fireEvent.click(send);
    fireEvent.click(send);

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0]?.[0]).toEqual({
      contractType: 'rent-contract-v1',
      schemaId: 'rent-contract-v1-schema',
      fields: { tenant_name: 'Ada Lovelace' },
      meta: { userId: 'agent-001', origin: 'ui' },
    });
  });

  it('preserves entered data, exposes retry guidance, and focuses a server-invalid field', async () => {
    mutate.mockImplementation((_request, callbacks) => {
      callbacks?.onError?.(
        new ContractRequestError('Google Sheets no está disponible.', {
          status: 503,
          retriable: true,
          fieldErrors: [
            { field: 'tenant_name', message: 'Revisá el nombre ingresado.' },
          ],
        }),
      );
      callbacks?.onSettled?.();
    });

    const { input } = await renderStepB();
    fireEvent.change(input, { target: { value: 'Ada Lovelace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Revisá el nombre ingresado.')).toBeTruthy();
    expect(screen.getByText('Google Sheets no está disponible.')).toBeTruthy();
    expect(screen.getByText(/reintentar sin perder los datos/i)).toBeTruthy();
    expect(input.value).toBe('Ada Lovelace');
    expect(document.activeElement).toBe(input);
  });

  it('renders safe Sheet and audit links from a successful receipt', async () => {
    mutate.mockImplementation((_request, callbacks) => {
      callbacks?.onSuccess?.({
        receipt: {
          submissionId: 'SUB-2026-07-21-ABC123',
          timestamp: '2026-07-21T14:30:00.000Z',
          sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-id',
          appendedRange: 'Contratos!A2:AG2',
          auditUrl: '/api/contracts/audits/SUB-2026-07-21-ABC123',
        },
      });
      callbacks?.onSettled?.();
    });

    const { input } = await renderStepB();
    fireEvent.change(input, { target: { value: 'Ada Lovelace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Contrato enviado')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Abrir Google Sheet' }).getAttribute('href'),
    ).toBe('https://docs.google.com/spreadsheets/d/sheet-id');
    expect(
      screen.getByRole('link', { name: 'Ver recibo de auditoría' }).getAttribute('href'),
    ).toBe('/api/contracts/audits/SUB-2026-07-21-ABC123');
  });

  it('has no axe violations in the Step B dialog', async () => {
    const { container } = await renderStepB();
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });
});
