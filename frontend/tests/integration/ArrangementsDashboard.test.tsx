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
let resolveOrders: (config: InternalAxiosRequestConfig) => Promise<unknown>;

function reject(config: InternalAxiosRequestConfig, status: number): never {
  throw new AxiosError('Request rejected', 'ERR_BAD_RESPONSE', config, undefined,
    { data: {}, status, statusText: String(status), config, headers: {} });
}

const adapter = vi.fn<AxiosAdapter>(async config => {
  const path = config.url ?? '';
  let data: unknown;
  if (path === '/api/auth/session') data = authenticated ? organizationSession : { authenticated: false };
  else if (path.endsWith('/context')) {
    const context = organizationContext(path.includes('/solar/') ? 'solar' : 'azar');
    data = { ...context, capabilities };
  } else if (path.endsWith('/arrangements/orders')) data = await resolveOrders(config);
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
  authenticated = true;
  capabilities = ['arrangements.read'];
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  adapter.mockClear();
  axios.defaults.adapter = adapter;
  resolveOrders = async config => ({ ...page, items: config.params.status
    ? page.items.filter(item => item.status === config.params.status) : page.items });
});
afterEach(() => {
  cleanup(); queryClient.clear(); axios.defaults.adapter = originalAdapter;
  sessionStorage.clear(); window.history.replaceState(null, '', '/');
});

describe('SPEC-39 arrangement dashboard', () => {
  it('renders persisted fields and sends exact status filters under the confirmed UUID', async () => {
    renderDashboard();
    const list = await screen.findByRole('list', { name: 'Órdenes abiertas' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText(first.id)).toBeTruthy();
    expect(within(list).getAllByRole('term').map(term => term.textContent))
      .toEqual(['Nombre', 'Estado', 'Identificador', 'Nombre', 'Estado', 'Identificador']);
    const filter = screen.getByRole('combobox', { name: 'Filtrar por estado' });
    fireEvent.change(filter, { target: { value: 'in_progress' } });
    await waitFor(() => expect(screen.queryByText('Ventana')).toBeNull());
    expect(await screen.findByText('Puerta')).toBeTruthy();
    expect(within(filter).getAllByRole('option').map(option => option.textContent)).toEqual(['Todos', 'En curso', 'Abierta']);
    fireEvent.change(filter, { target: { value: '' } });
    expect(await screen.findByText('Ventana')).toBeTruthy();
    expect(requests().every(([config]) => config.withCredentials && config.signal
      && config.url === `/api/organizations/${A}/arrangements/orders`)).toBe(true);
    expect(requests().some(([config]) => config.params.status === 'in_progress')).toBe(true);
    expect(window.location.search).toBe('');
  });

  it('keeps Generar propiedad focusable and inert after loading', async () => {
    renderDashboard(); await screen.findByText('Ventana');
    const button = screen.getByRole('button', { name: 'Generar propiedad' });
    const count = adapter.mock.calls.length;
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button); fireEvent.keyDown(button, { key: 'Enter' }); fireEvent.keyUp(button, { key: ' ' });
    await act(async () => { await Promise.resolve(); });
    expect(adapter.mock.calls).toHaveLength(count);
    expect(window.location.pathname).toBe('/t/azar/arrangements');
    expect(screen.getByText('Ventana')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('distinguishes empty organization, loading, filtered empty and a vanished selected state', async () => {
    let release!: (value: unknown) => void;
    resolveOrders = () => new Promise(resolve => { release = resolve; });
    renderDashboard();
    expect(await screen.findByText('Cargando órdenes…')).toBeTruthy();
    await act(async () => { release({ ...page, items: [], available_statuses: [] }); });
    expect(await screen.findByText('No hay órdenes abiertas en esta organización.')).toBeTruthy();
    resolveOrders = async () => page;
    await act(async () => { await queryClient.invalidateQueries(); });
    await screen.findByText('Ventana');
    resolveOrders = async () => ({ ...page, items: [], available_statuses: ['open'] });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'in_progress' } });
    expect(await screen.findByText('No hay órdenes abiertas con este estado.')).toBeTruthy();
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
    expect(screen.getByRole('option', { name: 'En curso' })).toBeTruthy();
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

  it('shows safe errors instead of an empty state and rejects a response from another organization', async () => {
    resolveOrders = async () => ({ ...page, organization_id: B });
    renderDashboard();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Ventana')).toBeNull();
    expect(screen.queryByText('No hay órdenes abiertas en esta organización.')).toBeNull();
    resolveOrders = async () => page;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ventana')).toBeTruthy();
  });

  it('does not query without the confirmed read capability', async () => {
    capabilities = [];
    renderDashboard();
    expect(await screen.findByText('No tenés acceso a las órdenes de esta organización.')).toBeTruthy();
    expect(requests()).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Inicio' })).toBeTruthy();
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
