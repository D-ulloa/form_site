// @vitest-environment jsdom
import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { organizationContext, organizationSession } from '../fixtures/organizations';

const originalAdapter = axios.defaults.adapter;
const A = organizationContext('azar').organization.id;
const B = organizationContext('solar').organization.id;
const first = { id: '50000000-0000-4000-8000-000000000001', name: 'Ventana', status: 'open' };
const second = { id: '50000000-0000-4000-8000-000000000002', name: 'Puerta', status: 'in_progress' };
const page = { organization_id: A, items: [first, second], available_statuses: ['in_progress', 'open'], next_cursor: null };
let queryClient: QueryClient;
let capabilities: string[];
let authenticated: boolean;
let mutateOrder: (config: InternalAxiosRequestConfig) => Promise<unknown>;
let resolveOrders: (config: InternalAxiosRequestConfig) => Promise<unknown>;

function reject(config: InternalAxiosRequestConfig, status: number): never {
  throw new AxiosError('Request rejected', 'ERR_BAD_RESPONSE', config, undefined,
    { data: {}, status, statusText: String(status), config, headers: {} });
}
function rejectInvalidCursor(config: InternalAxiosRequestConfig): never {
  throw new AxiosError('Request rejected', 'ERR_BAD_RESPONSE', config, undefined,
    { data: { error: { code: 'INVALID_CURSOR' } }, status: 400, statusText: '400', config, headers: {} });
}

const adapter = vi.fn<AxiosAdapter>(async config => {
  const path = config.url ?? '';
  let data: unknown;
  if (path === '/api/auth/session') data = authenticated ? organizationSession : { authenticated: false };
  else if (path.endsWith('/context')) {
    const context = organizationContext(path.includes('/solar/') ? 'solar' : 'azar');
    data = { ...context, capabilities };
  } else if (path.endsWith('/arrangements/properties')) data = { organization_id: path.includes(B) ? B : A, items: [], next_cursor: null };
  else if (path.endsWith('/arrangements/orders')) data = await resolveOrders(config);
  else if (path.endsWith('/personal/assignees')) data = { organization_id: A,
    items: [{ id: '30000000-0000-4000-8000-000000000009', name: 'Técnico', occupation: 'Mantenimiento' }], next_cursor: null };
  else if (['/status', '/assignment', '/reject'].some(suffix => path.endsWith(suffix)) && ['patch', 'delete', 'post'].includes(config.method ?? '')) data = await mutateOrder(config);
  else throw new Error(`Unexpected request ${path}`);
  return { data, status: 200, statusText: 'OK', config, headers: {} };
});

function renderDashboard() {
  window.history.replaceState(null, '', '/t/azar/arrangements');
  return render(<StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></StrictMode>);
}
function navigate(path: string) {
  act(() => { window.history.pushState(null, '', path); window.dispatchEvent(new PopStateEvent('popstate')); });
}
const requests = () => adapter.mock.calls.filter(([config]) => config.url?.endsWith('/arrangements/orders'));

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
  authenticated = true;
  capabilities = ['organization.read', 'arrangements.read'];
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  adapter.mockClear();
  axios.defaults.adapter = adapter;
  resolveOrders = async config => {
    const search = typeof config.params?.search === 'string' ? config.params.search.toLowerCase() : '';
    const status = typeof config.params?.status === 'string' ? config.params.status : '';
    return { ...page, items: page.items.filter(item =>
      (!status || item.status === status) && (!search || item.name.toLowerCase().includes(search))) };
  };
});
afterEach(() => {
  cleanup(); queryClient.clear(); axios.defaults.adapter = originalAdapter; vi.useRealTimers();
  sessionStorage.clear(); window.history.replaceState(null, '', '/');
});

describe('SPEC-39 arrangement dashboard', () => {
  it('renders persisted fields and sends exact status filters under the confirmed UUID', async () => {
    renderDashboard();
    const list = await screen.findByRole('list', { name: 'Solicitudes de arreglo' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).queryByText(first.id)).toBeNull();
    expect(within(list).queryByText(second.id)).toBeNull();
    expect(within(list).getAllByText('Propiedad no registrada')).toHaveLength(2);
    const filter = screen.getByRole('combobox', { name: 'Filtrar por estado' });
    fireEvent.change(filter, { target: { value: 'in_progress' } });
    await waitFor(() => expect(screen.queryByText('Ventana')).toBeNull());
    expect(await screen.findByText('Puerta')).toBeTruthy();
    expect(within(filter).getAllByRole('option').map(option => option.textContent)).toEqual(['Todos', 'Sin procesar', 'En proceso', 'Solucionado', 'Archivados', 'Rechazadas']);
    fireEvent.change(filter, { target: { value: '' } });
    expect(await screen.findByText('Ventana')).toBeTruthy();
    expect(requests().every(([config]) => config.withCredentials && config.signal
      && config.url === `/api/organizations/${A}/arrangements/orders`)).toBe(true);
    expect(requests().some(([config]) => config.params.status === 'in_progress')).toBe(true);
    expect(window.location.search).toBe('');
  });

  it('retains orders while hiding property mutations from read-only capabilities', async () => {
    renderDashboard(); await screen.findByText('Ventana');
    expect(screen.queryByRole('button', { name: 'Generar propiedad' })).toBeNull();
    expect(await screen.findByText('No hay propiedades en esta organización.')).toBeTruthy();
    expect(window.location.pathname).toBe('/t/azar/arrangements');
  });

  it('distinguishes empty organization, loading, filtered empty and a vanished selected state', async () => {
    let release!: (value: unknown) => void;
    resolveOrders = () => new Promise(resolve => { release = resolve; });
    renderDashboard();
    expect(await screen.findByText('Cargando órdenes…')).toBeTruthy();
    await act(async () => { release({ ...page, items: [], available_statuses: [] }); });
    expect(await screen.findByText('No hay solicitudes en esta organización.')).toBeTruthy();
    resolveOrders = async () => page;
    await act(async () => { await queryClient.invalidateQueries(); });
    await screen.findByText('Ventana');
    resolveOrders = async () => ({ ...page, items: [], available_statuses: ['open'] });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'in_progress' } });
    expect(await screen.findByText('No hay solicitudes con este estado.')).toBeTruthy();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('in_progress');
  });

  it('paginates without losing states located outside the first page and labels a continuation failure', async () => {
    let fail = true;
    resolveOrders = async config => {
      if (!config.params.cursor) return { ...page, items: [first], next_cursor: 'opaque-next' };
      if (fail) reject(config, 503);
      return { ...page, items: [second] };
    };
    renderDashboard(); await screen.findByText('Ventana');
    expect(screen.getByRole('option', { name: 'En proceso' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/La lista está incompleta/)).toBeTruthy();
    expect(screen.getByText('Ventana')).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Puerta')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
  });

  it('restarts order pagination from the first page after an invalid cursor', async () => {
    let firstPageCalls = 0;
    let continuationCalls = 0;
    let cursorRejected = false;
    resolveOrders = async config => {
      if (config.params.cursor) { continuationCalls += 1; cursorRejected = true; return rejectInvalidCursor(config); }
      firstPageCalls += 1;
      return cursorRejected ? page : { ...page, items: [first], next_cursor: 'expired-cursor' };
    };
    renderDashboard(); await screen.findByText('Ventana');
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByText('Puerta')).toBeTruthy();
    await waitFor(() => expect(firstPageCalls).toBeGreaterThanOrEqual(2));
    expect(continuationCalls).toBe(1);
    expect(requests().filter(([config]) => Boolean(config.params.cursor))).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows safe errors instead of an empty state and rejects a response from another organization', async () => {
    resolveOrders = async () => ({ ...page, organization_id: B });
    renderDashboard();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Ventana')).toBeNull();
    expect(screen.queryByText('No hay solicitudes en esta organización.')).toBeNull();
    resolveOrders = async () => page;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ventana')).toBeTruthy();
  });

  it('does not query without the confirmed read capability', async () => {
    capabilities = ['organization.read'];
    renderDashboard();
    expect(await screen.findByText('No tenés acceso a las órdenes de esta organización.')).toBeTruthy();
    expect(requests()).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Inicio' })).toBeTruthy();
  });

  it('debounces order search, combines it with status and clears back to the full list', async () => {
    capabilities = ['organization.read', 'arrangements.read'];
    renderDashboard();
    expect(await screen.findByText('Ventana')).toBeTruthy();
    const input = screen.getByLabelText('Buscar órdenes');
    fireEvent.change(input, { target: { value: 'puer' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('Puerta')).toBeTruthy();
    expect(screen.queryByText('Ventana')).toBeNull();
    expect(requests().some(([config]) => config.params.search === 'puer')).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar por estado' }), { target: { value: 'open' } });
    expect(await screen.findByText('No hay órdenes que coincidan con la búsqueda.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda de órdenes' }));
    expect(await screen.findByText('Ventana')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Limpiar búsqueda de órdenes' }) as HTMLButtonElement).disabled).toBe(true);
    expect(requests().at(-1)?.[0].params.search).toBeUndefined();
  });

  it('shows the 100-character limit and keeps the last valid order search when input is too long', async () => {
    renderDashboard(); await screen.findByText('Ventana');
    const input = screen.getByLabelText('Buscar órdenes') as HTMLInputElement;
    expect(input.maxLength).toBe(100);
    expect(input.getAttribute('aria-describedby')).toContain(`${input.id}-hint`);
    const requestCount = requests().length;
    fireEvent.change(input, { target: { value: 'a'.repeat(101) } });
    expect(await screen.findByText('Usá hasta 100 caracteres.')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain(`${input.id}-error`);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Ventana')).toBeTruthy();
    expect(requests()).toHaveLength(requestCount);
  });

  it('hides the order search bar for viewer without removing existing status filtering', async () => {
    const viewerAdapter = vi.fn<AxiosAdapter>(async config => {
      const path = config.url ?? '';
      let payload: unknown;
      if (path === '/api/auth/session') payload = organizationSession;
      else if (path.endsWith('/context')) {
        const context = organizationContext(path.includes('/solar/') ? 'solar' : 'azar');
        payload = { ...context, membership: { ...context.membership, role: 'viewer' }, capabilities };
      } else if (path.endsWith('/arrangements/properties')) payload = { organization_id: A, items: [], next_cursor: null };
      else if (path.endsWith('/arrangements/orders')) payload = await resolveOrders(config);
      else throw new Error(`Unexpected request ${path}`);
      return { data: payload, status: 200, statusText: 'OK', config, headers: {} };
    });
    axios.defaults.adapter = viewerAdapter;
    capabilities = ['organization.read', 'arrangements.read'];
    renderDashboard();
    expect(await screen.findByText('Ventana')).toBeTruthy();
    expect(screen.queryByLabelText('Buscar órdenes')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Filtrar por estado' })).toBeTruthy();
    axios.defaults.adapter = adapter;
  });

  it.each([401, 403, 404])('removes already loaded data when a later request loses access (%s)', async code => {
    renderDashboard(); await screen.findByText('Ventana');
    resolveOrders = async config => { if (code === 401) authenticated = false; return reject(config, code); };
    await act(async () => { await queryClient.invalidateQueries(); });
    await waitFor(() => expect(window.location.pathname).toBe(code === 401 ? '/login' : '/'));
    expect(screen.queryByText('Ventana')).toBeNull();
    await waitFor(() => expect(queryClient.getQueryCache().findAll({ queryKey: ['organization', A] })).toHaveLength(0));
  });

  it('cancels a late response and resets filter on an organization switch', async () => {
    renderDashboard(); await screen.findByText('Ventana');
    let release!: (value: unknown) => void;
    resolveOrders = config => config.url?.includes(A) ? new Promise(resolve => { release = resolve; })
      : Promise.resolve({ ...page, organization_id: B, items: [{ ...second, name: 'Solo Solar' }] });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'in_progress' } });
    await waitFor(() => expect(requests().at(-1)?.[0].params.status).toBe('in_progress'));
    const oldSignal = requests().at(-1)?.[0].signal;
    navigate('/t/solar/arrangements');
    expect(await screen.findByText('Solo Solar')).toBeTruthy();
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { release({ ...page, items: [second] }); });
    expect(screen.queryByText('Puerta')).toBeNull();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('link', { name: 'Inicio' }).getAttribute('href')).toBe('/t/solar');
  });
});


it('saves a permitted status with the current version and refreshes only the organization list', async () => {
  capabilities = ['organization.read', 'arrangements.read', 'arrangements.status.update'];
  let current = { ...first, organization_id: A, description: 'Humedad en techo', property: { id: '40000000-0000-4000-8000-000000000001', name: 'Casa Norte' },
    created_at: '2026-09-12T12:00:00Z', submitted_at: '2026-09-12T12:00:00Z', updated_at: '2026-09-12T12:00:00Z', version: 2, legacy: false, created_by_you: false, assets: [] };
  resolveOrders = async () => ({ ...page, items: [current], available_statuses: ['open', 'in_progress', 'solved', 'archived'] });
  mutateOrder = async config => {
    expect(JSON.parse(config.data)).toEqual({ status: 'archived', expected_version: 2 });
    current = { ...current, status: 'archived', version: 3 }; return current;
  };
  renderDashboard(); await screen.findByText('Humedad en techo');
  fireEvent.change(screen.getByRole('combobox', { name: 'Estado de la solicitud' }), { target: { value: 'archived' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar estado' }));
  await waitFor(() => expect(screen.getAllByText('Archivada')).toHaveLength(2));
  expect((screen.getByRole('button', { name: 'Guardar estado' }) as HTMLButtonElement).disabled).toBe(true);
  expect(adapter.mock.calls.some(([config]) => config.method === 'patch' && config.url === `/api/organizations/${A}/arrangements/orders/${first.id}/status`)).toBe(true);
});
it('explains a version conflict and refreshes the current state before another write', async () => {
  capabilities = ['organization.read', 'arrangements.read', 'arrangements.status.update'];
  let current = { ...first, organization_id: A, description: 'Solicitud compartida', property: null,
    created_at: null, submitted_at: null, updated_at: null, version: 2, legacy: true, created_by_you: false, assets: [] };
  resolveOrders = async () => ({ ...page, items: [current], available_statuses: ['open', 'in_progress', 'solved', 'archived'] });
  mutateOrder = async config => {
    current = { ...current, status: 'solved', version: 3 };
    throw new AxiosError('Conflict', 'ERR_BAD_RESPONSE', config, undefined, { data: { error: 'VERSION_CONFLICT', current: { id: first.id, status: 'solved', version: 3 } }, status: 409, statusText: 'Conflict', config, headers: {} });
  };
  renderDashboard(); await screen.findByText('Solicitud compartida');
  fireEvent.change(screen.getByRole('combobox', { name: 'Estado de la solicitud' }), { target: { value: 'in_progress' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar estado' }));
  await screen.findByText(/Alguien actualizó esta solicitud/);
  await waitFor(() => expect(screen.getAllByText('Solucionado')).toHaveLength(3));
});

it.each(['assign', 'unassign', 'reject'])('refreshes an obsolete order after %s fails without retrying the write', async action => {
  capabilities = ['organization.read', 'arrangements.read', 'arrangements.assignment.manage', 'arrangements.request.reject', 'arrangements.requester.read'];
  const assignee = { id: '30000000-0000-4000-8000-000000000009', name: 'Técnico', occupation: 'Mantenimiento', available: true };
  let current = { ...first, organization_id: A, description: 'Solicitud concurrente', status: 'in_progress',
    property: { id: '40000000-0000-4000-8000-000000000001', name: 'Casa' }, requester: null,
    assignee: assignee as typeof assignee | null, created_at: null, submitted_at: null, updated_at: null,
    version: 2, legacy: false, created_by_you: false, assets: [] };
  resolveOrders = async () => ({ ...page, items: [current], available_statuses: ['open', 'in_progress', 'solved', 'archived', 'rejected'] });
  let writes = 0;
  mutateOrder = async config => {
    writes += 1;
    expect(JSON.parse(config.data).expected_version).toBe(2);
    current = { ...current, status: 'solved', version: 3, assignee: null };
    throw new AxiosError('Conflict', 'ERR_BAD_RESPONSE', config, undefined,
      { data: { error: 'VERSION_CONFLICT' }, status: 409, statusText: 'Conflict', config, headers: {} });
  };
  renderDashboard(); await screen.findByText('Solicitud concurrente');
  if (action === 'assign') {
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar personal' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar asignación' }));
  } else if (action === 'unassign') fireEvent.click(screen.getByRole('button', { name: 'Quitar asignación' }));
  else {
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
  }
  await waitFor(() => expect(screen.getAllByText('Solucionado')).toHaveLength(2));
  expect(screen.queryByRole('button', { name: 'Reasignar personal' })).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(writes).toBe(1);
});
