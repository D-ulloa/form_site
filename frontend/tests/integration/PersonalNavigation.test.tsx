// @vitest-environment jsdom
import { StrictMode, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthenticationProvider } from '../../src/app/contexts/AuthenticationContext';
import { OrganizationRouteBoundary } from '../../src/app/contexts/OrganizationContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios, { AxiosError, type AxiosAdapter } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { organizationContext, organizationSession, type OrganizationSlug } from '../fixtures/organizations';
import type { AdminSession } from '../../src/features/contracts/services/adminAuthApi';

const originalAdapter = axios.defaults.adapter;
let queryClient: QueryClient;
let session: AdminSession | null;
let resolveContext: (slug: string) => Promise<ReturnType<typeof organizationContext>>;
let contextStatus: number;
function personal(slug: OrganizationSlug = 'azar'): ReturnType<typeof organizationContext> {
  const context = organizationContext(slug);
  return { ...context, membership: { ...context.membership, role: 'personal' },
    capabilities: ['personal.home.read'], home_destination: 'personal' };
}
const adapter = vi.fn<AxiosAdapter>(async config => {
  const path = config.url ?? '';
  let data: unknown;
  let status = 200;
  if (path === '/api/auth/session') data = session ?? { authenticated: false };
  else if (path === '/api/auth/logout') { session = null; data = {}; }
  else if (path === '/api/auth/login') { session = organizationSession; data = session; }
  else if (/^\/api\/organizations\/[^/]+\/context$/u.test(path)) {
    status = contextStatus;
    if (status === 200) data = await resolveContext(path.split('/')[3]);
  } else throw new Error(`Unexpected product request: ${path}`);
  const response = { data, status, statusText: String(status), config, headers: {} };
  if (status !== 200) throw new AxiosError('Rejected', 'ERR_BAD_RESPONSE', config, undefined, response);
  return response;
});
const paths = () => adapter.mock.calls.map(([config]) => config.url ?? '');
function mount(path: string) {
  window.history.replaceState(null, '', path);
  render(<StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></StrictMode>);
}
function navigate(path: string) {
  act(() => { window.history.pushState(null, '', path); window.dispatchEvent(new PopStateEvent('popstate')); });
}
function assertEmptyHome() {
  const main = screen.getByRole('main');
  expect(within(main).getByRole('heading', { name: 'Inicio', level: 1 })).toBeTruthy();
  expect(main.textContent).toBe('Inicio');
  expect(within(main).queryByRole('button')).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
  expect(paths().every(path => path.startsWith('/api/auth/') || path.endsWith('/context'))).toBe(true);
}
beforeEach(() => {
  session = structuredClone(organizationSession);
  contextStatus = 200;
  resolveContext = async slug => personal(slug === 'solar' ? 'solar' : 'azar');
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  adapter.mockClear(); axios.defaults.adapter = adapter;
});
afterEach(() => { cleanup(); queryClient.clear(); axios.defaults.adapter = originalAdapter; vi.restoreAllMocks(); });

it.each(['', '/personal', '/arrangements', '/properties/new', '/properties/success/submission',
  '/contracts/admin', '/contracts/admin/entry', '/settings/organization', '/settings/members',
  '/settings/invitations', '/settings/lifecycle'])('keeps direct entry %s behind the exclusive home guard', async suffix => {
  mount(`/t/azar${suffix}`);
  expect(screen.queryByRole('button', { name: /^Agregar nueva propiedad/u })).toBeNull();
  await screen.findByRole('heading', { name: 'Inicio' });
  expect(window.location.pathname).toBe('/t/azar/personal');
  assertEmptyHome();
});

it('selects the destination from confirmed context, even when the session summary has an old role', async () => {
  mount('/');
  fireEvent.click(await screen.findByRole('link', { name: /Azar/u }));
  await screen.findByRole('heading', { name: 'Inicio' });
  assertEmptyHome();
  expect(window.location.pathname).toBe('/t/azar/personal');
});

it('uses the normal login flow after joining, without an invitation', async () => {
  session = null;
  mount('/login');
  await screen.findByRole('heading', { name: 'Iniciá sesión' });
  fireEvent.change(screen.getByLabelText(/Correo electrónico/u), { target: { value: 'ana@example.test' } });
  fireEvent.change(screen.getByLabelText(/^Contraseña/u), { target: { value: 'test-password-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  fireEvent.click(await screen.findByRole('link', { name: /Azar/u }));
  await screen.findByRole('heading', { name: 'Inicio' });
  assertEmptyHome();
  expect(paths().some(path => path.includes('invitation'))).toBe(false);
});

it.each(['owner', 'admin', 'member', 'viewer'] as const)('returns %s from exclusive Inicio to the internal home', async role => {
  resolveContext = async () => ({ ...organizationContext('azar'), membership: { ...organizationContext('azar').membership, role } });
  mount('/t/azar/personal');
  await screen.findByRole('button', { name: /^Agregar nueva propiedad/u });
  expect(window.location.pathname).toBe('/t/azar');
  expect(screen.queryByRole('heading', { name: 'Inicio' })).toBeNull();
});

it('isolates different roles in A and B and removes cached product data', async () => {
  resolveContext = async slug => slug === 'solar' ? organizationContext('solar') : personal();
  mount('/t/solar');
  await screen.findByRole('button', { name: /^Agregar nueva propiedad/u });
  queryClient.setQueryData(['solar', 'private-data'], { private: true });
  navigate('/t/azar');
  expect(screen.queryByRole('button', { name: /^Agregar nueva propiedad/u })).toBeNull();
  await screen.findByRole('heading', { name: 'Inicio' });
  expect(queryClient.getQueryData(['solar', 'private-data'])).toBeUndefined();
  assertEmptyHome();
});

it.each([401, 403, 404, 503])('fails closed on context HTTP %s', async code => {
  contextStatus = code; mount('/t/azar/personal');
  if (code === 503) await screen.findByText('El contexto seguro no está disponible.');
  else await screen.findByRole('heading', { name: 'Elegí una organización' });
  expect(screen.queryByRole('heading', { name: 'Inicio' })).toBeNull();
});

it.each(['suspended', 'removed'] as const)('rejects a returned %s membership even with stale capabilities', async status => {
  resolveContext = async () => ({ ...personal(), membership: { ...personal().membership, status } });
  mount('/t/azar/personal');
  await screen.findByRole('heading', { name: 'Elegí una organización' });
  expect(screen.queryByRole('heading', { name: 'Inicio' })).toBeNull();
});

it('requires the home capability and server destination together', async () => {
  resolveContext = async () => ({ ...personal(), capabilities: [], home_destination: null });
  mount('/t/azar/personal');
  await screen.findByRole('heading', { name: 'Elegí una organización' });
  expect(paths().filter(path => path.endsWith('/context'))).toHaveLength(1);
});

it.each(['focus', 'visibilitychange', 'navigation'] as const)('rechecks suspension on %s', async event => {
  mount('/t/azar/personal'); await screen.findByRole('heading', { name: 'Inicio' });
  contextStatus = 404;
  act(() => {
    if (event === 'focus') window.dispatchEvent(new Event('focus'));
    else if (event === 'visibilitychange') document.dispatchEvent(new Event('visibilitychange'));
  });
  if (event === 'navigation') navigate('/t/azar');
  await screen.findByRole('heading', { name: 'Elegí una organización' });
  expect(screen.queryByRole('heading', { name: 'Inicio' })).toBeNull();
});

it('rechecks a role change within the same session when authentication refreshes', async () => {
  resolveContext = async () => organizationContext('azar');
  mount('/t/azar'); await screen.findByRole('button', { name: /^Agregar nueva propiedad/u });
  resolveContext = async () => personal();
  session = structuredClone(organizationSession);
  act(() => window.dispatchEvent(new Event('form-site-auth-refresh')));
  await screen.findByRole('heading', { name: 'Inicio' });
  assertEmptyHome();
});

it('discards an old context response after switching organizations', async () => {
  let release!: (context: ReturnType<typeof organizationContext>) => void;
  resolveContext = slug => slug === 'solar' ? Promise.resolve(personal('solar'))
    : new Promise(resolve => { release = resolve; });
  mount('/t/azar');
  await waitFor(() => expect(release).toBeDefined());
  navigate('/t/solar/personal');
  await screen.findByRole('heading', { name: 'Inicio' });
  await act(async () => release(organizationContext('azar')));
  expect(window.location.pathname).toBe('/t/solar/personal');
  assertEmptyHome();
});

it('rejects context for another identity', async () => {
  resolveContext = async () => ({ ...personal(), membership: { ...personal().membership, user_id: 'someone-else' } });
  mount('/t/azar/personal');
  await screen.findByRole('heading', { name: 'Elegí una organización' });
});

it('logs out and clears the exclusive home and cached state', async () => {
  mount('/t/azar/personal'); await screen.findByRole('heading', { name: 'Inicio' });
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await screen.findByRole('heading', { name: 'Iniciá sesión' });
  expect(screen.queryByRole('heading', { name: 'Inicio' })).toBeNull();
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});

function DraftPage() {
  const [value, setValue] = useState('');
  return <label>Borrador<input value={value} onChange={event => setValue(event.target.value)} /></label>;
}
it('preserves an unfinished form while tab revalidation confirms unchanged authority', async () => {
  resolveContext = async () => organizationContext('azar');
  window.history.replaceState(null, '', '/t/azar');
  render(<StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthenticationProvider>
    <Routes><Route path="/t/:organizationSlug" element={<OrganizationRouteBoundary />}>
      <Route index element={<DraftPage />} />
    </Route></Routes>
  </AuthenticationProvider></BrowserRouter></QueryClientProvider></StrictMode>);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Borrador' }), { target: { value: 'Trabajo sin guardar' } });
  let release!: (context: ReturnType<typeof organizationContext>) => void;
  resolveContext = () => new Promise(resolve => { release = resolve; });
  act(() => window.dispatchEvent(new Event('focus')));
  await screen.findByText('Validando organización…');
  expect(screen.queryByRole('textbox')).toBeNull();
  await waitFor(() => expect(release).toBeDefined());
  await act(async () => release(organizationContext('azar')));
  expect((await screen.findByRole('textbox', { name: 'Borrador' }) as HTMLInputElement).value).toBe('Trabajo sin guardar');
});
