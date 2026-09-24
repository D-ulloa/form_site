// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ArrangementRequestCard } from '../../src/features/arrangements/components/ArrangementRequestCard';
import {
  acceptWorkReport, arrangementStatusLabel, saveWorkReport, submitWorkReport,
} from '../../src/features/arrangements/services/arrangementRequestsApi';

const org = '20000000-0000-4000-8000-000000000001';
const id = '50000000-0000-4000-8000-000000000001';
const baseOrder = {
  id, organization_id: org, name: 'Filtración', description: 'Filtración en cocina', status: 'in_progress' as const,
  property: { id, name: 'Casa' }, created_at: null, submitted_at: '2026-09-12T12:00:00Z', updated_at: null,
  version: 2, legacy: false, created_by_you: false, assets: [],
};
const draftReport = {
  status: 'draft' as const, body: 'Cambio de grifería', version: 1,
  created_at: '2026-09-12T12:00:00Z', updated_at: '2026-09-12T12:00:00Z',
  submitted_at: null, accepted_at: null, created_by: { id: '30000000-0000-4000-8000-000000000009', name: 'Personal' },
};
const submittedReport = { ...draftReport, status: 'submitted' as const, version: 2, submitted_at: '2026-09-12T13:00:00Z' };
const acceptedReport = { ...submittedReport, status: 'accepted' as const, version: 3, accepted_at: '2026-09-12T14:00:00Z' };

let capabilities: string[];
vi.mock('../../src/app/contexts/OrganizationContext', () => ({
  useOrganization: () => ({
    organization: { id: org }, membership: { id: '30000000-0000-4000-8000-000000000009', role: 'personal' },
    epoch: 1, get capabilities() { return capabilities; },
  }),
}));
vi.mock('../../src/app/contexts/AuthenticationContext', () => ({ useAuthentication: () => ({ refresh: vi.fn() }) }));
vi.mock('../../src/features/arrangements/services/arrangementRequestsApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../src/features/arrangements/services/arrangementRequestsApi')>()),
  saveWorkReport: vi.fn(), submitWorkReport: vi.fn(), acceptWorkReport: vi.fn(), updateRequestStatus: vi.fn(),
}));

function mount(order: unknown, audience: 'personal' | 'tenant' | 'manager' = 'personal') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}>
    <ArrangementRequestCard order={order as never} audience={audience} />
  </QueryClientProvider></MemoryRouter>);
}
beforeEach(() => {
  capabilities = ['personal.arrangements.read', 'personal.arrangements.report.write'];
  vi.clearAllMocks();
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('resolves card labels from work_report without changing statusOptions', () => {
  expect(arrangementStatusLabel({ ...baseOrder, status: 'solved', work_report: submittedReport })).toBe('Pendiente de aceptación');
  expect(arrangementStatusLabel({ ...baseOrder, status: 'archived', work_report: acceptedReport })).toBe('Completada y archivada');
  expect(arrangementStatusLabel({ ...baseOrder, status: 'solved' })).toBe('Solucionado');
  expect(arrangementStatusLabel({ ...baseOrder, status: 'archived' })).toBe('Archivada');
});

it('personal saves a draft, validates empty text, and submits only when clean', async () => {
  capabilities = ['personal.arrangements.read', 'personal.arrangements.report.write'];
  vi.mocked(saveWorkReport).mockResolvedValue({ id, status: 'in_progress', version: 2, work_report: draftReport });
  vi.mocked(submitWorkReport).mockResolvedValue({ id, status: 'solved', version: 3, work_report: submittedReport });
  mount({ ...baseOrder });
  const field = await screen.findByLabelText('Reporte de trabajo');
  expect(screen.getByText('0 / 10000')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Guardar reporte' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(field, { target: { value: '   ' } });
  expect((screen.getByRole('button', { name: 'Guardar reporte' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(field, { target: { value: 'Cambio de grifería' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar reporte' }));
  await waitFor(() => expect(saveWorkReport).toHaveBeenCalledWith(org, baseOrder, 'Cambio de grifería', expect.any(AbortSignal)));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Marcar trabajo como terminado' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Marcar trabajo como terminado' }));
  await waitFor(() => expect(window.confirm).toHaveBeenCalled());
  await waitFor(() => expect(submitWorkReport).toHaveBeenCalledWith(org, baseOrder, 1, expect.any(AbortSignal)));
});

it('personal cannot see internal status controls and shows TENANT_REQUIRED actionable error', async () => {
  capabilities = ['personal.arrangements.read', 'personal.arrangements.report.write'];
  vi.mocked(saveWorkReport).mockResolvedValue({ id, status: 'in_progress', version: 2, work_report: draftReport });
  vi.mocked(submitWorkReport).mockRejectedValue(new AxiosError('TENANT_REQUIRED', 'ERR_BAD_RESPONSE', undefined, undefined,
    { status: 409, statusText: 'Conflict', data: { error: 'TENANT_REQUIRED' }, headers: {}, config: {} as never }));
  mount({ ...baseOrder });
  await screen.findByLabelText('Reporte de trabajo');
  expect(screen.queryByRole('button', { name: 'Guardar estado' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Reporte de trabajo'), { target: { value: 'Listo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar reporte' }));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Marcar trabajo como terminado' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Marcar trabajo como terminado' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/inquilino activo/i));
  expect(screen.getByLabelText('Reporte de trabajo')).toBeTruthy();
});

it('tenant accepts a submitted report with confirmation and shows the report', async () => {
  capabilities = ['inquilino.arrangements.read', 'inquilino.arrangements.accept'];
  vi.mocked(acceptWorkReport).mockResolvedValue({ ...baseOrder, status: 'archived', work_report: acceptedReport });
  mount({ ...baseOrder, status: 'solved', work_report: submittedReport }, 'tenant');
  expect(screen.getByText('Pendiente de aceptación')).toBeTruthy();
  expect(screen.getByText('Cambio de grifería')).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', { name: 'Aceptar orden y reporte' }));
  await waitFor(() => expect(acceptWorkReport).toHaveBeenCalledWith(org, { ...baseOrder, status: 'solved', work_report: submittedReport }, expect.any(AbortSignal)));
});

it('manager sees submitted report but cannot archive via generic status while locked', async () => {
  capabilities = ['arrangements.read', 'arrangements.status.update'];
  mount({ ...baseOrder, status: 'solved', work_report: submittedReport, requester: null, assignee: null }, 'manager');
  expect(screen.getByText('Pendiente de aceptación')).toBeTruthy();
  expect((screen.getByLabelText('Estado de la solicitud') as HTMLSelectElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Guardar estado' }) as HTMLButtonElement).disabled).toBe(true);
});
