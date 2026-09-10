// @vitest-environment jsdom
/// <reference types="node" />

import { webcrypto } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertGoogleOAuthStorageAvailable, createGoogleOAuthStorage, GoogleOAuthStorageError,
} from '../../src/features/contracts/services/googleOAuthStorage.ts';

const storageKey = 'sb-pkce-test-auth-token';
const clients: SupabaseClient[] = [];
const fetchMock = vi.fn(async () => new Response(JSON.stringify({
  access_token: 'test-access-token', refresh_token: 'test-refresh-token',
  token_type: 'bearer', expires_in: 3600,
  user: { id: 'user-1', email: 'test@example.test', aud: 'authenticated' },
}), { status: 200, headers: { 'Content-Type': 'application/json' } }));

function client() {
  const instance = createClient('https://pkce-test.supabase.co', 'public-test-key', {
    auth: { storageKey, storage: createGoogleOAuthStorage(), persistSession: true,
      autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce' },
    global: { fetch: fetchMock },
  });
  clients.push(instance);
  return instance;
}

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  localStorage.clear(); sessionStorage.clear(); fetchMock.mockClear();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(clients.splice(0).map(instance => instance.auth.dispose()));
  vi.unstubAllGlobals();
});

describe('Google OAuth temporary storage', () => {
  it('survives a fresh client on first return despite stale sessions in browser storage', async () => {
    const initiating = client();
    await initiating.auth.initialize();
    const { data } = await initiating.auth.signInWithOAuth({ provider: 'google', options: {
      skipBrowserRedirect: true, redirectTo: 'http://localhost:3000/auth/callback',
    } });
    const verifier = JSON.parse(sessionStorage.getItem(`${storageKey}-code-verifier`)!);
    expect(new URL(data.url!).searchParams.get('code_challenge')).toBeTruthy();
    // A stale SDK session previously caused initialization to remove the new verifier.
    localStorage.setItem(storageKey, JSON.stringify({ access_token: 'invalid-old-session' }));
    sessionStorage.setItem(storageKey, JSON.stringify({ access_token: 'invalid-old-session' }));
    await initiating.auth.dispose();

    const returning = client();
    const result = await returning.auth.exchangeCodeForSession('fresh-google-code');
    expect(result.error).toBeNull();
    expect(result.data.session?.access_token).toBe('test-access-token');
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[0]).toContain('grant_type=pkce');
    expect(JSON.parse(request[1].body as string)).toEqual({
      auth_code: 'fresh-google-code', code_verifier: verifier,
    });
    expect(sessionStorage.getItem(`${storageKey}-code-verifier`)).toBeNull();
    expect(localStorage.getItem(storageKey)).not.toContain('test-access-token');
    expect(sessionStorage.getItem(storageKey)).not.toContain('test-access-token');
  });

  it('keeps Supabase tokens only in the current client memory', async () => {
    const first = createGoogleOAuthStorage();
    await first.setItem(storageKey, 'temporary-token');
    expect(await first.getItem(storageKey)).toBe('temporary-token');
    expect(await createGoogleOAuthStorage().getItem(storageKey)).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('does not borrow another tab or legacy localStorage verifier', async () => {
    localStorage.setItem(`${storageKey}-code-verifier`, JSON.stringify('other-tab-verifier'));
    const result = await client().auth.exchangeCodeForSession('other-tab-code');
    expect(result.error?.code).toBe('pkce_code_verifier_not_found');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${storageKey}-code-verifier`)).toBeTruthy();
  });

  it('rejects unavailable storage before redirecting', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(assertGoogleOAuthStorageAvailable).toThrow(GoogleOAuthStorageError);
  });

  it('rejects silently discarded storage writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
    expect(assertGoogleOAuthStorageAvailable).toThrow(GoogleOAuthStorageError);
    expect(() => createGoogleOAuthStorage().setItem(`${storageKey}-code-verifier`, 'value'))
      .toThrow(GoogleOAuthStorageError);
  });
});
