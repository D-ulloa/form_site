import axios from 'axios';

export const SESSION_AUTHENTICATION_FAILURE_EVENT = 'form-site-session-authentication-failure';
const PROTECTED_AUTH_PATHS = new Set(['/api/auth/logout', '/api/auth/sessions', '/api/auth/sessions/rotate',
  '/api/auth/sessions/revoke-others', '/api/auth/password/change', '/api/auth/email/change']);

/** Only cookie-authenticated application APIs can invalidate the app session. */
export function notifyApplicationSessionFailure(error: unknown): void {
  if (!axios.isAxiosError(error) || error.response?.status !== 401
    || !error.config?.withCredentials || !error.config.url) return;
  let url: URL;
  try { url = new URL(axios.getUri(error.config), window.location.origin); }
  catch { return; }
  if (url.origin !== window.location.origin) return;
  const path = url.pathname.replace(/^\/_\/backend(?=\/)/u, '');
  if (path.startsWith('/api/organizations/') || PROTECTED_AUTH_PATHS.has(path)) {
    window.dispatchEvent(new Event(SESSION_AUTHENTICATION_FAILURE_EVENT));
  }
}
