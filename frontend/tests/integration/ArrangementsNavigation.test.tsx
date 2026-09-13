// @vitest-environment jsdom

import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios, { AxiosError, type AxiosAdapter } from 'axios';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.tsx';
import { organizationContext, organizationSession, organizationSlugs } from '../fixtures/organizations.ts';

const originalAdapter = axios.defaults.adapter;
let queryClient: QueryClient;
let authenticated: boolean;
let sessionUnavailable: boolean;
let contextStatus: number;
let resolveContext: (slug: string) => Promise<ReturnType<typeof organizationContext>>;

const adapter = vi.fn<AxiosAdapter>(async config => {
  const path = config.url ?? '';
  let data: unknown;
  let status = 200;
  if (config.method === 'get' && path === '/api/auth/session') {
    data = authenticated ? organizationSession : { authenticated: false };
    if (sessionUnavailable) status = 503;
  } else if (config.method === 'get' && /^\/api\/organizations\/[^/]+\/context$/u.test(path)) {
    status = contextStatus;
    if (status === 200) data = await resolveContext(path.split('/')[3]);
  } else if (config.method === 'get' && /^\/api\/organizations\/[^/]+\/contracts\/admin\/entries$/u.test(path)) {
    data = { entries: [] };
  } else if (config.method === 'get' && path.endsWith('/arrangements/properties')) {
    data = { organization_id: path.split('/')[3], items: [], next_cursor: null };
  } else if (config.method === 'get' && path.endsWith('/arrangements/orders')) {
    data = { organization_id: path.split('/')[3], items: [], available_statuses: [], next_cursor: null };
  } else {
    throw new Error(`Unexpected request: ${config.method} ${path}`);
  }
  const response = { data, status, statusText: String(status), headers: {}, config };
  if (status !== 200) throw new AxiosError('Request rejected', 'ERR_BAD_RESPONSE', config, undefined, response);
  return response;
});

function renderApp(path: string) {
  window.history.replaceState(null, '', path);
  return render(
    <StrictMode>
      <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
    </StrictMode>,
  );
}

function navigateTo(path: string) {
  act(() => {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

function requestedPaths() {
  return adapter.mock.calls.map(([config]) => config.url);
}

function pendingContext() {
  let resolve!: (context: ReturnType<typeof organizationContext>) => void;
  const promise = new Promise<ReturnType<typeof organizationContext>>(accept => { resolve = accept; });
  return { promise, resolve };
}

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) { this.removeAttribute('open'); },
  });
});

beforeEach(() => {
  authenticated = true;
  sessionUnavailable = false;
  contextStatus = 200;
  resolveContext = async slug => {
    if (slug !== 'azar' && slug !== 'solar') throw new Error('Unknown organization');
    return organizationContext(slug);
  };
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  adapter.mockClear();
  axios.defaults.adapter = adapter;
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  axios.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('SPEC-38 arrangement navigation', () => {
  it.each(organizationSlugs)('preserves action order and the round trip within %s', async slug => {
    renderApp(`/t/${slug}`);
    await screen.findByRole('button', { name: 'Gestión de arreglos' });
    expect(within(screen.getByRole('main')).getAllByRole('heading', { level: 2 }).map(node => node.textContent?.trim()))
      .toEqual(['Agregar nueva propiedad', 'Generar contrato', 'Administrar contratos', 'Gestión de arreglos']);

    fireEvent.click(screen.getByRole('button', { name: 'Gestión de arreglos' }));
    const home = await screen.findByRole('link', { name: 'Inicio' });
    expect(window.location.pathname).toBe(`/t/${slug}/arrangements`);
    expect(home.getAttribute('href')).toBe(`/t/${slug}`);
    expect(await screen.findByText('No hay solicitudes en esta organización.')).toBeTruthy();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Generar propiedad' })).toBeNull();
    expect(new Set(requestedPaths())).toEqual(new Set(['/api/auth/session', `/api/organizations/${slug}/context`, `/api/organizations/${organizationContext(slug).organization.id}/arrangements/orders`, `/api/organizations/${organizationContext(slug).organization.id}/arrangements/properties`]));
    expect(adapter.mock.calls.every(([config]) => config.method === 'get' && config.withCredentials)).toBe(true);

    fireEvent.click(home);
    expect(await screen.findByRole('button', { name: 'Gestión de arreglos' })).toBeTruthy();
    expect(window.location.pathname).toBe(`/t/${slug}`);
  });

  it.each([
    ['Agregar nueva propiedad', 'properties/new', 'Nueva propiedad'],
    ['Administrar contratos', 'contracts/admin', 'Administrar contratos'],
  ])('preserves the %s destination', async (label, destination, heading) => {
    renderApp('/t/solar');
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${label}`, 'u') }));
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
    expect(window.location.pathname).toBe(`/t/solar/${destination}`);
  });

  it('preserves the passive contract generation modal', async () => {
    renderApp('/t/solar');
    fireEvent.click(await screen.findByRole('button', { name: /^Generar contrato/u }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(window.location.pathname).toBe('/t/solar');
    expect(adapter.mock.calls.every(([config]) => config.method === 'get')).toBe(true);
  });

  it('keeps actions behind organization selection at the root', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Elegí una organización' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gestión de arreglos' })).toBeNull();
    expect(new Set(requestedPaths())).toEqual(new Set(['/api/auth/session']));
  });
});

describe('SPEC-38 direct route protection', () => {
  it('waits for confirmed context before rendering the dashboard', async () => {
    const pending = pendingContext();
    resolveContext = () => pending.promise;
    renderApp('/t/solar/arrangements');
    await waitFor(() => expect(requestedPaths()).toContain('/api/organizations/solar/context'));
    expect(screen.getByRole('status').textContent).toBe('Validando organización…');
    expect(screen.queryByRole('link', { name: 'Inicio' })).toBeNull();
    await act(async () => { pending.resolve(organizationContext('solar')); });
    expect((await screen.findByRole('link', { name: 'Inicio' })).getAttribute('href')).toBe('/t/solar');
  });

  it('uses the confirmed slug for Inicio', async () => {
    resolveContext = async () => organizationContext('solar');
    renderApp('/t/organization-alias/arrangements');
    expect((await screen.findByRole('link', { name: 'Inicio' })).getAttribute('href')).toBe('/t/solar');
  });

  it('redirects an anonymous direct visit to login without resolving an organization', async () => {
    authenticated = false;
    renderApp('/t/solar/arrangements');
    expect(await screen.findByRole('heading', { name: 'Iniciá sesión' })).toBeTruthy();
    expect(window.location.pathname).toBe('/login');
    expect(screen.queryByRole('link', { name: 'Inicio' })).toBeNull();
    expect(new Set(requestedPaths())).toEqual(new Set(['/api/auth/session']));
  });

  it.each([401, 403, 404])('preserves rejection for organization context HTTP %s', async status => {
    contextStatus = status;
    renderApp('/t/inaccessible/arrangements');
    expect(await screen.findByRole('heading', { name: 'Elegí una organización' })).toBeTruthy();
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByRole('link', { name: 'Inicio' })).toBeNull();
  });

  it('keeps the dashboard hidden when organization context is unavailable', async () => {
    contextStatus = 503;
    renderApp('/t/solar/arrangements');
    expect(await screen.findByText('El contexto seguro no está disponible.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Inicio' })).toBeNull();
  });

  it('keeps the dashboard hidden when session validation fails', async () => {
    sessionUnavailable = true;
    renderApp('/t/solar/arrangements');
    await waitFor(() => expect(adapter.mock.results[0]?.value).toBeTruthy());
    await act(async () => { await Promise.allSettled(adapter.mock.results.map(result => result.value)); });
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Inicio' })).toBeNull();
    expect(requestedPaths()).toEqual(['/api/auth/session']);
  });

  it('hides the old organization during a switch and ignores a late response', async () => {
    renderApp('/t/azar/arrangements');
    expect((await screen.findByRole('link', { name: 'Inicio' })).getAttribute('href')).toBe('/t/azar');
    const pending = pendingContext();
    resolveContext = slug => slug === 'solar' ? pending.promise : Promise.resolve(organizationContext('azar'));
    navigateTo('/t/solar/arrangements');
    await waitFor(() => expect(requestedPaths()).toContain('/api/organizations/solar/context'));
    expect(screen.queryByRole('link', { name: 'Inicio' })).toBeNull();
    navigateTo('/t/azar/arrangements');
    expect((await screen.findByRole('link', { name: 'Inicio' })).getAttribute('href')).toBe('/t/azar');
    await act(async () => { pending.resolve(organizationContext('solar')); });
    expect(screen.getByRole('link', { name: 'Inicio' }).getAttribute('href')).toBe('/t/azar');
  });
});
