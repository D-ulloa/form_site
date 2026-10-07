// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationProvider, useAuthentication } from '../../src/app/contexts/AuthenticationContext.tsx';
import { AdminAuthError, checkAdminSession, fetchAdminSession, type AdminSession } from '../../src/features/contracts/services/adminAuthApi.ts';

vi.mock('../../src/features/contracts/services/adminAuthApi.ts', () => ({
  AdminAuthError: class extends Error {
    readonly status?: number;
    constructor(message: string, status?: number) { super(message); this.status = status; }
  },
  checkAdminSession: vi.fn(), fetchAdminSession: vi.fn(), logoutAdmin: vi.fn(),
  recoverSelfServiceRegistration: vi.fn(),
  SELF_SERVICE_OPERATION_STORAGE_KEY: 'form_site_self_service_operation',
}));

const session: AdminSession = {
  authenticated: true, user: { id: 'worker-id', email: 'worker@example.test', name: 'Ana' },
  session: { id: 'app-session', auth_method: 'password', assurance_level: 'aal1',
    created_at: '2026-10-06T12:00:00Z', absolute_expires_at: '2026-10-06T20:00:00Z',
    idle_expires_at: '2026-10-06T12:30:00Z', remembered: false },
};
const propertyPath = '/t/azar/properties/new';

function SessionProbe() {
  const authentication = useAuthentication();
  return <>
    <p>{authentication.status}</p>
    <p>{authentication.session?.user.name}</p>
    <button onClick={() => void authentication.refresh()}>Refresh login</button>
  </>;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

async function renderSession(path = propertyPath) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[path]}><AuthenticationProvider>
      <LocationProbe />
      <Routes>
        <Route path={propertyPath} element={<SessionProbe />} />
        <Route path="/contracts/:entryId/:role" element={<><p>Formulario público</p><SessionProbe /></>} />
        <Route path="/login" element={<p>Iniciá sesión</p>} />
      </Routes>
    </AuthenticationProvider></MemoryRouter>
  </QueryClientProvider>);
  await act(() => vi.advanceTimersByTimeAsync(0));
  return { ...view, client };
}

async function failRequest(url: string, status: number, withCredentials = true, baseURL?: string) {
  await act(async () => {
    await axios.post(url, {}, { withCredentials, baseURL, adapter: (config: InternalAxiosRequestConfig) =>
      Promise.reject(new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined,
        { status, statusText: 'Rejected', data: {}, headers: {}, config })),
    }).catch(() => undefined);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(fetchAdminSession).mockResolvedValue(session);
  vi.mocked(checkAdminSession).mockResolvedValue(session);
  sessionStorage.clear();
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Application session monitoring', () => {
  it('checks every five minutes and redirects confirmed expiry while clearing authenticated cache', async () => {
    const { client } = await renderSession();
    expect(screen.getByText('authenticated')).toBeTruthy();
    vi.mocked(checkAdminSession).mockClear();
    client.setQueryData(['organization', 'azar', 'private'], { value: 'private data' });
    vi.mocked(checkAdminSession).mockResolvedValue(null);
    await act(() => vi.advanceTimersByTimeAsync(299_999));
    expect(checkAdminSession).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(checkAdminSession).toHaveBeenCalledOnce();
    expect(screen.getByText('Iniciá sesión')).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/login?reason=session_expired&return_to=%2Ft%2Fazar%2Fproperties%2Fnew');
    expect(client.getQueryData(['organization', 'azar', 'private'])).toBeUndefined();
  });

  it('pauses hidden-tab polling and checks immediately on returning to the tab', async () => {
    const { unmount } = await renderSession();
    vi.mocked(checkAdminSession).mockClear();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(() => vi.advanceTimersByTimeAsync(300_000));
    expect(checkAdminSession).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    vi.mocked(checkAdminSession).mockResolvedValue(null);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(screen.getByText('Iniciá sesión')).toBeTruthy();
    vi.mocked(checkAdminSession).mockClear();
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(300_000));
    expect(checkAdminSession).not.toHaveBeenCalled();
  });

  it.each([undefined, 403, 503])('keeps the form and cached data after a transient or non-auth failure (%s)', async (status) => {
    const { client } = await renderSession();
    client.setQueryData(['property-form'], { entered: 'unfinished property' });
    vi.mocked(checkAdminSession).mockRejectedValue(new AdminAuthError('Unable to check', status));
    await act(() => vi.advanceTimersByTimeAsync(300_000));
    expect(screen.getByText('authenticated')).toBeTruthy();
    expect(screen.queryByText('Iniciá sesión')).toBeNull();
    expect(client.getQueryData(['property-form'])).toEqual({ entered: 'unfinished property' });
  });

  it('checks a protected API 401 immediately and sends a confirmed invalid session to login', async () => {
    await renderSession();
    vi.mocked(checkAdminSession).mockClear();
    vi.mocked(checkAdminSession).mockResolvedValue(null);
    await failRequest('/api/organizations/azar/properties/legacy/media/presign', 401);
    expect(checkAdminSession).toHaveBeenCalledOnce();
    expect(screen.getByText('Iniciá sesión')).toBeTruthy();
  });

  it('recognizes production API prefixes and the base URL used by organization requests', async () => {
    await renderSession();
    vi.mocked(checkAdminSession).mockClear();
    vi.mocked(checkAdminSession).mockResolvedValue(null);
    await failRequest('/organizations/azar/invitations', 401, true, '/_/backend/api');
    expect(checkAdminSession).toHaveBeenCalledOnce();
    expect(screen.getByText('Iniciá sesión')).toBeTruthy();
  });

  it('does not confuse permissions, provider uploads, token links, or login errors with app-session expiry', async () => {
    await renderSession();
    vi.mocked(checkAdminSession).mockClear();
    vi.mocked(checkAdminSession).mockResolvedValue(null);
    await failRequest('/api/organizations/azar/properties/legacy/media/presign', 403);
    await failRequest('https://storage.example.test/upload?token=example', 401);
    await failRequest('/api/contracts/entry/submit?token=example', 401);
    await failRequest('/api/auth/login', 401);
    expect(checkAdminSession).not.toHaveBeenCalled();
    expect(screen.getByText('authenticated')).toBeTruthy();
  });

  it('rechecks a protected 401 that arrived during an older validity check', async () => {
    await renderSession();
    vi.mocked(checkAdminSession).mockClear();
    let resolveCheck!: (value: AdminSession | null) => void;
    vi.mocked(checkAdminSession).mockImplementationOnce(() => new Promise(resolve => { resolveCheck = resolve; }))
      .mockResolvedValue(null);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await failRequest('/api/organizations/azar/properties/legacy/submit', 401);
    await act(async () => { resolveCheck(session); });
    expect(checkAdminSession).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Iniciá sesión')).toBeTruthy();
  });

  it('deduplicates focus checks and ignores an old expiry response after a fresh login', async () => {
    await renderSession();
    vi.mocked(checkAdminSession).mockClear();
    let resolveCheck!: (value: AdminSession | null) => void;
    vi.mocked(checkAdminSession).mockImplementation(() => new Promise(resolve => { resolveCheck = resolve; }));
    await act(async () => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')); });
    expect(checkAdminSession).toHaveBeenCalledOnce();
    vi.mocked(fetchAdminSession).mockResolvedValue({ ...session, user: { ...session.user, name: 'New login' } });
    await act(async () => { fireEvent.click(screen.getByText('Refresh login')); });
    await act(async () => { resolveCheck(null); });
    expect(screen.getByText('New login')).toBeTruthy();
    expect(screen.getByText('authenticated')).toBeTruthy();
    expect(screen.queryByText('Iniciá sesión')).toBeNull();
  });

  it('leaves public contract-token forms available when an unrelated app session would expire', async () => {
    await renderSession('/contracts/entry/client');
    vi.mocked(checkAdminSession).mockClear();
    vi.mocked(checkAdminSession).mockResolvedValue(null);
    await act(() => vi.advanceTimersByTimeAsync(300_000));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(checkAdminSession).not.toHaveBeenCalled();
    expect(screen.getByText('Formulario público')).toBeTruthy();
  });
});
