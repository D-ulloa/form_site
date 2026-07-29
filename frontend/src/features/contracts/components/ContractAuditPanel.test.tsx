// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContractAudit } from '../services/contractApi.ts';
import { ContractAuditPanel } from './ContractAuditPanel.tsx';

vi.mock('../services/contractApi.ts', () => ({
  fetchContractAudit: vi.fn(),
}));

const auditUrl = '/api/contracts/audits/SUB-2026-07-21-ABC123';

beforeEach(() => {
  vi.mocked(fetchContractAudit).mockReset();
});

afterEach(cleanup);

describe('ContractAuditPanel', () => {
  it('keeps a real href and loads the authenticated redacted audit inline', async () => {
    let resolveAudit: ((value: unknown) => void) | undefined;
    vi.mocked(fetchContractAudit).mockReturnValue(
      new Promise((resolve) => {
        resolveAudit = resolve;
      }),
    );

    render(<ContractAuditPanel auditUrl={auditUrl} userId="agent-001" />);
    const link = screen.getByRole('link', { name: 'Ver recibo de auditoría' });
    expect(link.getAttribute('href')).toBe(auditUrl);
    fireEvent.click(link);

    expect(fetchContractAudit).toHaveBeenCalledWith(auditUrl, 'agent-001');
    expect(screen.getByText('Cargando auditoría...')).toBeTruthy();

    await act(async () => {
      resolveAudit?.({ submissionId: 'SUB-2026-07-21-ABC123', fields: '[REDACTED]' });
    });

    expect(await screen.findByText('Recibo de auditoría')).toBeTruthy();
    expect(screen.getByText(/\[REDACTED\]/)).toBeTruthy();
  });

  it('shows an actionable inline error and retains the audit href', async () => {
    vi.mocked(fetchContractAudit).mockRejectedValueOnce(
      new Error('No autorizado para abrir la auditoría.'),
    );

    render(<ContractAuditPanel auditUrl={auditUrl} userId="agent-001" />);
    fireEvent.click(screen.getByRole('link', { name: 'Ver recibo de auditoría' }));

    expect(
      await screen.findByText('No autorizado para abrir la auditoría.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Ver recibo de auditoría' }).getAttribute('href'),
    ).toBe(auditUrl);
  });
});
