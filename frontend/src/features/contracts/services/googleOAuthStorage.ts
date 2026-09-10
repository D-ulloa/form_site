import type { SupportedStorage } from '@supabase/supabase-js';

export class GoogleOAuthStorageError extends Error {
  constructor() {
    super('El navegador no permite guardar el acceso con Google. Habilitá el almacenamiento del sitio y volvé a intentarlo en esta pestaña.');
    this.name = 'GoogleOAuthStorageError';
  }
}

/** Fail before leaving the app instead of silently falling back to memory. */
export function assertGoogleOAuthStorageAvailable(): void {
  const key = `form_site_google_probe_${crypto.randomUUID()}`;
  try {
    sessionStorage.setItem(key, key);
    if (sessionStorage.getItem(key) !== key) throw new GoogleOAuthStorageError();
    sessionStorage.removeItem(key);
  } catch {
    throw new GoogleOAuthStorageError();
  }
}

/**
 * Only PKCE state must survive the same-tab Google redirect. Supabase sessions
 * are temporary credentials for the backend handoff, not application sessions.
 * Keeping them in memory prevents SDK startup from recovering an old session
 * and deleting the new verifier when that old session is invalid or revoked.
 * Tab storage also prevents another tab's login/sign-out from removing it.
 */
export function createGoogleOAuthStorage(): SupportedStorage {
  const temporarySession = new Map<string, string>();
  return {
    getItem(key) {
      if (!key.endsWith('-code-verifier')) return temporarySession.get(key) ?? null;
      try { return sessionStorage.getItem(key); } catch { throw new GoogleOAuthStorageError(); }
    },
    setItem(key, value) {
      if (!key.endsWith('-code-verifier')) {
        temporarySession.set(key, value);
        return;
      }
      try {
        sessionStorage.setItem(key, value);
        if (sessionStorage.getItem(key) !== value) throw new GoogleOAuthStorageError();
      } catch { throw new GoogleOAuthStorageError(); }
    },
    removeItem(key) {
      if (!key.endsWith('-code-verifier')) {
        temporarySession.delete(key);
        return;
      }
      try { sessionStorage.removeItem(key); } catch { throw new GoogleOAuthStorageError(); }
    },
  };
}
