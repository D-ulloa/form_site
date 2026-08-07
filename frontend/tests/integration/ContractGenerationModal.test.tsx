// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContractPublicSchema } from '../../src/features/contracts/types.ts';
import { useContractSchema } from '../../src/features/contracts/hooks/useContractSchema.ts';
import { useSubmitContract } from '../../src/features/contracts/hooks/useSubmitContract.ts';
import { ContractGenerationModal } from '../../src/features/contracts/components/ContractGenerationModal.tsx';

vi.mock('../../src/features/contracts/hooks/useContractSchema.ts', () => ({
  useContractSchema: vi.fn(),
}));

vi.mock('../../src/features/contracts/hooks/useSubmitContract.ts', () => ({
  useSubmitContract: vi.fn(),
}));

const contractSchema: ContractPublicSchema = {
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
const execCommand = vi.fn<(command: string) => boolean>();

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
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: execCommand,
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  clipboardWriteText.mockReset().mockResolvedValue(undefined);
  execCommand.mockReset().mockReturnValue(false);

  vi.mocked(useContractSchema).mockReturnValue({
    data: contractSchema,
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useContractSchema>);

  vi.mocked(useSubmitContract).mockReturnValue({
    isPending: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  } as unknown as ReturnType<typeof useSubmitContract>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ContractGenerationModal', () => {
  it('copies the external link and advances to the JSON-rendered form', async () => {
    render(
      <ContractGenerationModal open userId="agent-001" onClose={vi.fn()} />,
    );

    expect(screen.getByText('Paso 1 de 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(contractSchema.googleFormLink);
    });
    expect(await screen.findByLabelText(/^Nombre del inquilino/)).toBeTruthy();
    expect(screen.getByText('Paso 2 de 2')).toBeTruthy();
    expect(screen.getByText('Enlace copiado')).toBeTruthy();

    const jsonPanel = screen.getByLabelText('Esquema JSON de campos del contrato');
    expect(jsonPanel.textContent).toContain('tenant_name');
    expect(jsonPanel.textContent).toContain('maxLength');
  });

  it('keeps step one open and announces a clipboard failure', async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error('permission denied'));

    render(
      <ContractGenerationModal open userId="agent-001" onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));

    expect(
      await screen.findByText(/Permití el acceso al portapapeles/i),
    ).toBeTruthy();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getByText('Paso 1 de 2')).toBeTruthy();
  });
});
