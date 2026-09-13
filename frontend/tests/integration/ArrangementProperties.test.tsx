// @vitest-environment jsdom
import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { organizationContext, organizationSession } from '../fixtures/organizations';

const A = organizationContext('azar').organization.id;
const B = organizationContext('solar').organization.id;
const P = '60000000-0000-4000-8000-000000000001';
const I = '70000000-0000-4000-8000-000000000001';
const member = { id: '30000000-0000-4000-8000-000000000007', display_name: 'Legacy', role: 'inquilino', status: 'active', version: 1 };
const property = { id: P, name: 'Casa' };
const shareUrl = `${window.location.origin}/invitations/accept#invitation_token=private-link-canary`;
const receipt = { invitation_id: I, status: 'pending', delivery_state: 'pending', delivery_method: 'share_link',
  expires_at: '2099-01-01T00:00:00Z', next_action: 'copy_or_revoke', arrangement_property_id: P, share_url: shareUrl };
const original = axios.defaults.adapter;
let client: QueryClient;
let properties: typeof property[];
let candidates: typeof member[];
let associated: typeof member[];
let capabilities: string[];
let post: (config: InternalAxiosRequestConfig) => Promise<unknown>;
const writeText = vi.fn().mockResolvedValue(undefined);
const adapter = vi.fn<AxiosAdapter>(async config => {
  const path = config.url ?? '';
  const organization = path.includes(B) || path.includes('/solar/') ? B : A;
  let data: unknown;
  if (path === '/api/auth/session') data = organizationSession;
  else if (path.endsWith('/context')) data = { ...organizationContext(organization === B ? 'solar' : 'azar'), capabilities };
  else if (config.method === 'post') data = await post(config);
  else if (path.endsWith('/orders')) data = { organization_id: organization, items: [], available_statuses: [], next_cursor: null };
  else if (path.endsWith('/properties')) data = { organization_id: organization, items: organization === A ? properties : [], next_cursor: null };
  else if (path.endsWith('/available')) data = { organization_id: organization, items: candidates, next_cursor: null };
  else if (path.endsWith('/inquilinos')) data = { organization_id: organization, items: associated, next_cursor: null };
  else if (path.endsWith('/invitations')) data = { organization_id: organization, items: [], next_cursor: null };
  else throw new Error(`Unexpected request ${path}`);
  return { data, status: 200, statusText: 'OK', config, headers: {} };
});
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});
beforeEach(() => {
  properties = []; candidates = [member]; associated = [];
  capabilities = ['organization.read', 'arrangements.read', 'arrangements.properties.create', 'arrangements.inquilinos.manage', 'members.read', 'members.invite', 'members.manage_member'];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  adapter.mockClear(); writeText.mockClear(); axios.defaults.adapter = adapter;
  post = async config => {
    if (config.url?.endsWith('/properties')) { properties = [property]; return property; }
    if (config.url?.endsWith('/inquilinos')) { candidates = []; associated = [member]; return { id: member.id, version: 2, arrangement_property_id: P }; }
    return receipt;
  };
});
afterEach(() => { cleanup(); client.clear(); axios.defaults.adapter = original; window.history.replaceState(null, '', '/'); });
function renderPage() {
  window.history.replaceState(null, '', '/t/azar/arrangements');
  return render(<StrictMode><QueryClientProvider client={client}><App /></QueryClientProvider></StrictMode>);
}
async function createForm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Generar propiedad' }));
  return screen.findByRole('dialog');
}
const posts = () => adapter.mock.calls.filter(([config]) => config.method === 'post');

it('creates a property with only name, preserves the empty orders section and can invite immediately', async () => {
  renderPage(); const dialog = await createForm();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Crear propiedad' }));
  expect(await screen.findByText('Ingresá un nombre.')).toBeTruthy(); expect(posts()).toHaveLength(0);
  fireEvent.change(screen.getByLabelText(/Nombre de la propiedad/), { target: { value: ' Casa ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Crear propiedad' }));
  expect(await screen.findByRole('dialog', { name: 'Agregar inquilino' })).toBeTruthy();
  expect(within(screen.getByRole('list', { name: 'Propiedades' })).getByText(P)).toBeTruthy();
  expect(screen.getByText('No hay solicitudes en esta organización.')).toBeTruthy();
  expect(JSON.parse(posts()[0][0].data)).toEqual({ name: 'Casa' });
  expect(posts()[0][0].headers.get('Idempotency-Key')).toBeTruthy();
});

it('cancels without writes and reuses the idempotency key when a response is lost', async () => {
  renderPage(); await createForm(); fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(posts()).toHaveLength(0);
  let calls = 0;
  post = async config => { if (++calls === 1) throw new AxiosError('lost response', 'ERR_NETWORK', config); properties = [property]; return property; };
  await createForm(); fireEvent.change(screen.getByLabelText(/Nombre de la propiedad/), { target: { value: 'Casa' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear propiedad' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect((screen.getByLabelText(/Nombre de la propiedad/) as HTMLInputElement).value).toBe('Casa');
  fireEvent.click(screen.getByRole('button', { name: 'Crear propiedad' }));
  await screen.findByRole('dialog', { name: 'Agregar inquilino' });
  expect(posts()).toHaveLength(2);
  expect(posts()[0][0].headers.get('Idempotency-Key')).toBe(posts()[1][0].headers.get('Idempotency-Key'));
});

it('keeps invitation links transient and copies the property-bound receipt', async () => {
  properties = [property]; renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar inquilino a Casa' }));
  fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'NEW@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generar invitación' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Copiar enlace' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(shareUrl));
  expect(JSON.parse(posts()[0][0].data)).toEqual({ email: 'new@example.test' });
  expect(posts()[0][0].url).toContain(`/properties/${P}/invitations`);
  expect(document.body.textContent).not.toContain('private-link-canary');
  expect(JSON.stringify(client.getQueryCache().getAll().map(query => query.state.data))).not.toContain('private-link-canary');
  expect(client.getMutationCache().getAll()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  expect(screen.queryByRole('button', { name: 'Copiar enlace' })).toBeNull();
});

it('offers explicit rotation after an issuance replay instead of displaying an invalid token', async () => {
  properties = [property]; post = async () => ({ ...receipt, share_url: undefined, next_action: 'rotate_or_revoke' });
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Agregar inquilino a Casa' }));
  fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'new@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generar invitación' }));
  expect(await screen.findByRole('button', { name: 'Generar enlace nuevo' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Copiar enlace' })).toBeNull();
});

it('associates an existing membership by ID/version, then refreshes its active status', async () => {
  properties = [property]; renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Agregar inquilino a Casa' }));
  fireEvent.click(screen.getByRole('button', { name: 'Asociar existente' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Asociar Legacy' }));
  expect(await screen.findByText('Inquilino asociado.')).toBeTruthy();
  expect(await screen.findByText(/Legacy · Inquilino activo/)).toBeTruthy();
  expect(JSON.parse(posts()[0][0].data)).toEqual({ membership_id: member.id, expected_version: 1 });
});

it('does not request membership or invitation data for read-only capabilities', async () => {
  capabilities = ['organization.read', 'arrangements.read']; properties = [property]; renderPage();
  expect(await screen.findByText('Casa')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Generar propiedad' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Agregar inquilino/ })).toBeNull();
  expect(adapter.mock.calls.some(([config]) => /invitations|inquilinos/.test(config.url ?? ''))).toBe(false);
});

it('aborts a late invitation response and closes its form on an organization switch', async () => {
  properties = [property]; let release!: (value: unknown) => void;
  post = () => new Promise(resolve => { release = resolve; });
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Agregar inquilino a Casa' }));
  fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'new@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generar invitación' }));
  await waitFor(() => expect(posts()).toHaveLength(1));
  const signal = posts()[0][0].signal;
  act(() => { window.history.pushState(null, '', '/t/solar/arrangements'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(await screen.findByText('No hay propiedades en esta organización.')).toBeTruthy();
  expect(signal?.aborted).toBe(true);
  await act(async () => { release(receipt); });
  expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByRole('button', { name: 'Copiar enlace' })).toBeNull();
});
