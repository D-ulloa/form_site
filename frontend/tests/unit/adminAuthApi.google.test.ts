// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(), signOut: vi.fn(), initialize: vi.fn(), signIn: vi.fn(),
  get: vi.fn(), post: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: {
  exchangeCodeForSession: mocks.exchange, signOut: mocks.signOut,
  initialize: mocks.initialize, signInWithOAuth: mocks.signIn,
} }) }));
vi.mock('axios', () => ({ default: { get: mocks.get, post: mocks.post,
  isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
} }));

const operationId = '11111111-1111-4111-8111-111111111111';
const session = { authenticated: true, user: { id: 'user-1', name: 'Ana', email: 'ana@example.test' },
  session: { id: 'app-session' }, memberships: [],
  onboarding: { operation_id: operationId, organization_slug: 'ana-org', email_verification_required: false } };
let api: typeof import('../../src/features/contracts/services/adminAuthApi.ts');

beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://pkce-test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
  sessionStorage.clear(); localStorage.clear();
  window.history.replaceState({}, '', `/auth/callback?code=one-use-code&self_service_operation=${operationId}`);
  mocks.exchange.mockResolvedValue({ data: { session: { access_token: 'temporary-access-token' } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.get.mockResolvedValue({ data: { authenticated: false } });
  mocks.post.mockResolvedValue({ data: session });
  api = await import('../../src/features/contracts/services/adminAuthApi.ts');
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Google callback and application handoff', () => {
  it('shares the entire exchange and registration handoff across duplicate calls and remounts', async () => {
    let release: ((value: unknown) => void) | undefined;
    mocks.post.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const first = api.completeGoogleLogin();
    expect(api.completeGoogleLogin()).toBe(first);
    await vi.waitFor(() => expect(mocks.post).toHaveBeenCalledOnce());
    expect(window.location.search).not.toContain('code=');
    expect(window.location.search).toContain(`self_service_operation=${operationId}`);
    expect(api.completeGoogleLogin()).toBe(first);
    release!({ data: session });
    expect(await first).toEqual(session);
    expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith('one-use-code');
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('/google/register'), {
      access_token: 'temporary-access-token', operation_id: operationId, remember_me: true,
    }, { withCredentials: true });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
  });

  it('retries a failed handoff without exchanging the Google code again', async () => {
    mocks.post.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(api.completeGoogleLogin()).rejects.toMatchObject({ stage: 'handoff' });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain('code=');
    const retried = api.retryGoogleHandoff();
    expect(await retried).toEqual(session);
    expect(mocks.exchange).toHaveBeenCalledOnce();
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(api.completeGoogleLogin()).toBe(retried);
  });

  it('recovers a response lost after the backend set its application cookie', async () => {
    mocks.post.mockRejectedValueOnce(new Error('response lost'));
    await expect(api.completeGoogleLogin()).rejects.toMatchObject({ stage: 'handoff' });
    mocks.get.mockResolvedValue({ data: session });
    await expect(api.retryGoogleHandoff()).resolves.toEqual(session);
    expect(mocks.post.mock.calls[1][0]).toContain(`/register/operations/${operationId}/recover`);
    expect(mocks.exchange).toHaveBeenCalledOnce();
  });

  it('offers a fresh flow for a missing verifier and never exposes the SDK boilerplate', async () => {
    mocks.exchange.mockResolvedValue({ data: { session: null }, error: {
      code: 'pkce_code_verifier_not_found', message: 'PKCE code verifier not found in storage. use @supabase/ssr',
    } });
    await expect(api.completeGoogleLogin()).rejects.toMatchObject({ stage: 'oauth', message: expect.stringContaining('misma pestaña') });
    expect(window.location.search).not.toContain('code=');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('recovers a completed registration after a full callback reload', async () => {
    window.history.replaceState({}, '', `/auth/callback?self_service_operation=${operationId}`);
    mocks.get.mockResolvedValue({ data: session });
    await expect(api.completeGoogleLogin()).resolves.toEqual(session);
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledWith(expect.stringContaining('/recover'), {}, expect.anything());
  });

  it('requires fresh OAuth after a reload without an application cookie', async () => {
    window.history.replaceState({}, '', `/auth/callback?self_service_operation=${operationId}`);
    await expect(api.completeGoogleLogin()).rejects.toMatchObject({ stage: 'oauth' });
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('preserves invitation routing and uses the normal Google session endpoint', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=invitation-code&return_to=/invitations/accept');
    await api.completeGoogleLogin(false);
    expect(mocks.post).toHaveBeenCalledWith(expect.stringContaining('/google/session'), {
      accessToken: 'temporary-access-token', rememberMe: false,
    }, { withCredentials: true });
    expect(new URLSearchParams(window.location.search).get('return_to')).toBe('/invitations/accept');
  });

  it('does not mask a completed application session when cleanup fails', async () => {
    mocks.signOut.mockRejectedValue(new Error('cleanup unavailable'));
    await expect(api.completeGoogleLogin()).resolves.toEqual(session);
    expect(mocks.post).toHaveBeenCalledOnce();
  });

  it('handles provider cancellation in URL fragments without trying the exchange', async () => {
    window.history.replaceState({}, '', '/auth/callback#error=access_denied&error_description=private-provider-details');
    await expect(api.completeGoogleLogin()).rejects.toMatchObject({ stage: 'oauth', message: 'Google no autorizó el acceso. Volvé a intentarlo.' });
    expect(window.location.hash).toBe('');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it('checks storage before creating a registration intent', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    await expect(api.startGoogleRegistration({ operationId, fullName: 'Ana', email: 'ana@example.test',
      organizationName: 'Ana Org', termsAccepted: true })).rejects.toThrow('almacenamiento');
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
