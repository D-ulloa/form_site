// @vitest-environment jsdom
import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios, { AxiosError, type AxiosAdapter } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { organizationContext, organizationSession } from '../fixtures/organizations';

const originalAdapter = axios.defaults.adapter;
const org = organizationContext('azar').organization.id;
const propertyA = '40000000-0000-4000-8000-000000000001';
const propertyB = '40000000-0000-4000-8000-000000000002';
const id = '50000000-0000-4000-8000-000000000001';
let property: string | null;
let queryClient: QueryClient;
let submitted: boolean;
let failSubmit: boolean;
let description: string;
const record = () => ({ id, organization_id: org, name: description, description, property: { id: propertyA, name: 'Casa Norte' },
  created_at: '2026-09-12T12:00:00Z', submitted_at: '2026-09-12T12:00:00Z', updated_at: '2026-09-12T12:00:00Z',
  status: 'archived', version: 2, legacy: false, created_by_you: false, assets: [] });
const adapter = vi.fn<AxiosAdapter>(async config => {
  const path = config.url ?? ''; let data: unknown;
  if (path === '/api/auth/session') data = organizationSession;
  else if (path.endsWith('/context')) {
    const context = organizationContext('azar');
    data = { ...context, membership: { ...context.membership, role: 'inquilino', arrangement_property_id: property },
      capabilities: ['inquilino.home.read', 'inquilino.arrangements.read', 'inquilino.arrangements.create'], home_destination: 'inquilino' };
  } else if (path.endsWith('/inquilino/orders')) data = { organization_id: org, items: submitted && property === propertyA ? [record()] : [], available_statuses: ['open', 'in_progress', 'solved', 'archived'], next_cursor: null };
  else if (path.endsWith('/order-drafts')) {
    description = JSON.parse(config.data).description; data = { id, submission_state: 'draft', status: 'open', version: 1 };
  } else if (path.endsWith('/submit')) {
    if (failSubmit) throw new AxiosError('Unavailable', 'ERR_BAD_RESPONSE', config, undefined, { status: 503, statusText: 'Unavailable', data: {}, headers: {}, config });
    submitted = true; data = { ...record(), status: 'open', created_by_you: true };
  } else throw new Error(`Unexpected request: ${path}`);
  return { data, status: 200, statusText: 'OK', headers: {}, config };
});
function mount() { window.history.replaceState(null, '', '/t/azar/inquilino'); render(<StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></StrictMode>); }
beforeEach(() => {
  property = propertyA; submitted = false; failSubmit = false; description = 'Historial de otro inquilino';
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  adapter.mockClear(); axios.defaults.adapter = adapter;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { cleanup(); queryClient.clear(); axios.defaults.adapter = originalAdapter; window.history.replaceState(null, '', '/'); });
it('does not query or offer creation without a linked property', async () => {
  property = null; mount();
  await screen.findByText(/No tenés una propiedad vinculada/);
  expect(screen.queryByRole('button', { name: 'Solicitud de arreglo' })).toBeNull();
  expect(adapter.mock.calls.filter(([config]) => config.url?.endsWith('/inquilino/orders'))).toHaveLength(0);
});
it('shows all property requests including archived ones without requester identity', async () => {
  submitted = true; mount();
  expect(await screen.findByText(description)).toBeTruthy();
  expect(screen.getByText('Archivada')).toBeTruthy();
  expect(screen.queryByText('Tu solicitud')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Guardar estado' })).toBeNull();
});
it('preserves description after failed submit, retries the same key and sends no property or asset authority', async () => {
  failSubmit = true; mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Solicitud de arreglo' }));
  fireEvent.change(screen.getByLabelText('Descripción del arreglo'), { target: { value: '  Humedad en el techo  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect((screen.getByLabelText('Descripción del arreglo') as HTMLTextAreaElement).value).toBe('  Humedad en el techo  ');
  failSubmit = false; fireEvent.click(screen.getByRole('button', { name: 'Reintentar envío' }));
  await screen.findByText(/Solicitud enviada/);
  const drafts = adapter.mock.calls.filter(([config]) => config.url?.endsWith('/order-drafts')).map(([config]) => config);
  expect(drafts).toHaveLength(2); expect(drafts[0].headers['Idempotency-Key']).toBe(drafts[1].headers['Idempotency-Key']);
  expect(JSON.parse(drafts[0].data)).toEqual({ description: 'Humedad en el techo' });
  expect(adapter.mock.calls.filter(([config]) => config.url?.endsWith('/submit')).map(([config]) => JSON.parse(config.data))).toEqual([{}, {}]);
});
it('rejects unsupported media without dropping valid selections', async () => {
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Solicitud de arreglo' }));
  const input = screen.getByLabelText('Imágenes y videos (opcional)');
  fireEvent.change(input, { target: { files: [new File(['png'], 'valid.png', { type: 'image/png' })] } });
  fireEvent.change(input, { target: { files: [new File(['svg'], 'bad.svg', { type: 'image/svg+xml' })] } });
  await screen.findByRole('alert'); expect(screen.getByText('valid.png')).toBeTruthy(); expect(screen.queryByText('bad.svg')).toBeNull();
});
it('rotates context and removes old history and open form when the linked property changes', async () => {
  submitted = true; mount(); await screen.findByText(description);
  fireEvent.click(screen.getByRole('button', { name: 'Solicitud de arreglo' }));
  fireEvent.change(screen.getByLabelText('Descripción del arreglo'), { target: { value: 'Private draft' } });
  property = propertyB;
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.queryByText(description)).toBeNull();
  expect(JSON.stringify(queryClient.getQueryCache().getAll().map(query => query.state.data))).not.toContain(description);
  await screen.findByText('Todavía no hay solicitudes para esta propiedad.');
});
