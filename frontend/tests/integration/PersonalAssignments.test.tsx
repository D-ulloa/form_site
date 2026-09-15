// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PersonalArrangements } from '../../src/features/arrangements/components/PersonalArrangements';
import { personalOrders } from '../../src/features/arrangements/services/arrangementAssignmentsApi';
import { InquilinoAcceptanceForm } from '../../src/features/organizations/components/InquilinoAcceptanceForm';
import { invitationAcceptanceContext } from '../../src/features/organizations/services/organizationApi';
const org = '20000000-0000-4000-8000-000000000001';
const id = '50000000-0000-4000-8000-000000000001';
vi.mock('../../src/app/contexts/OrganizationContext', () => ({ useOrganization: () => ({ organization: { id: org },
  membership: { id: '30000000-0000-4000-8000-000000000009', role: 'personal' }, epoch: 1, capabilities: ['personal.arrangements.read'] }) }));
vi.mock('../../src/app/contexts/AuthenticationContext', () => ({ useAuthentication: () => ({ refresh: vi.fn() }) }));
vi.mock('../../src/features/arrangements/services/arrangementAssignmentsApi', () => ({ personalOrders: vi.fn() }));
vi.mock('../../src/features/organizations/services/organizationApi', () => ({ invitationAcceptanceContext: vi.fn() }));
class FakeEvents extends EventTarget {
  static current: FakeEvents;
  onerror: (() => void) | null = null;
  constructor() { super(); FakeEvents.current = this; }
  close() {}
}
const row = { id, organization_id: org, name: 'Filtración', description: 'Descripción completa de la filtración', status: 'in_progress' as const,
  property: { id, name: 'Casa' }, created_at: null, submitted_at: null, updated_at: null, version: 2, legacy: false, created_by_you: false,
  assets: [], requester: { name: 'Inquilino autor', email: 'author@example.test', contact_number: '+58 412 1234567' } };
const page = (items: typeof row[]) => ({ organization_id: org, items, available_statuses: ['open' as const, 'in_progress' as const], next_cursor: null });
beforeEach(() => { vi.stubGlobal('EventSource', FakeEvents); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function dashboard() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><PersonalArrangements /></QueryClientProvider></MemoryRouter>); return client;
}
it('shows assigned contact with no internal controls and removes it on invalidation', async () => {
  vi.mocked(personalOrders).mockResolvedValue(page([row])); dashboard();
  expect(await screen.findByText('Inquilino autor')).toBeTruthy();
  expect(screen.getByText('+58 412 1234567')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Asignar|Rechazar|Guardar estado/ })).toBeNull();
  vi.mocked(personalOrders).mockResolvedValue(page([]));
  await act(async () => { FakeEvents.current.dispatchEvent(new MessageEvent('invalidate', { data: JSON.stringify({ revision: String(Date.now()) }) })); });
  expect(await screen.findByText('No tenés órdenes asignadas')).toBeTruthy();
  expect(screen.queryByText('Inquilino autor')).toBeNull();
});
it('a second invalidation cancels a slow refetch and its late response cannot restore private data', async () => {
  vi.mocked(personalOrders).mockResolvedValue(page([row])); dashboard();
  await screen.findByText('Inquilino autor');
  let resolve!: (value: ReturnType<typeof page>) => void;
  vi.mocked(personalOrders).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => { FakeEvents.current.dispatchEvent(new MessageEvent('invalidate', { data: JSON.stringify({ revision: String(Date.now()) }) })); });
  await waitFor(() => expect(resolve).toBeTypeOf('function'));
  vi.mocked(personalOrders).mockResolvedValue(page([]));
  await act(async () => { FakeEvents.current.dispatchEvent(new MessageEvent('invalidate', { data: JSON.stringify({ revision: String(Date.now()) }) })); });
  expect(await screen.findByText('No tenés órdenes asignadas')).toBeTruthy();
  await act(async () => { resolve(page([row])); });
  expect(screen.queryByText('Inquilino autor')).toBeNull();
});
it('initial and continuation failures are not presented as an empty personal list', async () => {
  vi.mocked(personalOrders).mockRejectedValue(new Error('offline')); dashboard();
  expect(await screen.findByRole('alert')).toBeTruthy(); expect(screen.queryByText('No tenés órdenes asignadas')).toBeNull();
});
it('first tenant onboarding requires a valid textual phone after authentication', async () => {
  vi.mocked(invitationAcceptanceContext).mockResolvedValue({ requires_inquilino_profile: true });
  const accept = vi.fn().mockResolvedValue(undefined);
  render(<InquilinoAcceptanceForm pending={false} onAccept={accept} />);
  const field = await screen.findByLabelText(/Número de teléfono/);
  fireEvent.change(field, { target: { value: '123' } }); fireEvent.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
  await screen.findByText(/Ingresá un teléfono/); expect(accept).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: ' +58 (0412) 1234567 ' } }); fireEvent.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
  await waitFor(() => expect(accept.mock.calls[0]?.[0]).toEqual({ contact_number: '+58 (0412) 1234567' }));
});
it('previous tenant reactivation offers acceptance without a phone form', async () => {
  vi.mocked(invitationAcceptanceContext).mockResolvedValue({ requires_inquilino_profile: false }); const accept = vi.fn();
  render(<InquilinoAcceptanceForm pending={false} onAccept={accept} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Aceptar invitación' }));
  expect(screen.queryByLabelText(/Número de teléfono/)).toBeNull(); expect(accept).toHaveBeenCalledWith();
});
