const TENANT_RETURN_PATH = /^\/t\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/(?:properties\/new|properties\/success\/[A-Za-z0-9_-]+|contracts\/admin(?:\/[A-Za-z0-9_-]+)?|settings\/(?:organization|members|invitations|lifecycle)))?\/?$/u;

export function safeSessionReturnPath(value: string | null): string {
  if (value === '/invitations/accept' || (value && TENANT_RETURN_PATH.test(value))) return value;
  return '/';
}

export function isSessionProtectedPage(pathname: string): boolean {
  return pathname === '/' || pathname === '/invitations/accept' || TENANT_RETURN_PATH.test(pathname);
}

export function sessionLoginPath(returnTo: string, expired = false): string {
  const params = new URLSearchParams();
  if (expired) params.set('reason', 'session_expired');
  const safePath = safeSessionReturnPath(returnTo);
  if (safePath !== '/') params.set('return_to', safePath);
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}
