import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// The SDK and browser storage are real; Google/Supabase and backend responses
// are intercepted. Never create external identities during this suite.
test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'Uses the local, mocked OAuth environment.');

const storageKey = 'sb-pkce-test-auth-token';
const operationId = '11111111-1111-4111-8111-111111111111';
const user = { id: '22222222-2222-4222-8222-222222222222', email: 'ana@example.test', name: 'Ana' };
const membership = { organization_id: 'org-1', organization_slug: 'pkce-org', organization_display_name: 'PKCE Org',
  organization_status: 'active', membership_id: 'member-1', membership_status: 'active', role: 'owner', capabilities: [] };
const publicSession = { authenticated: true, user, session: { id: 'session-1' }, memberships: [membership] };
const appSession = { ...publicSession,
  onboarding: { operation_id: operationId, organization_slug: 'pkce-org', email_verification_required: false } };
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: 4102444800, aud: 'authenticated' })}.test-signature`;

async function mockFlow(page: Page, failFirstHandoff = false) {
  const counts = { intents: 0, authorizations: 0, exchanges: 0, handoffs: 0, logouts: 0 };
  const challenges = new Map<string, string>();
  let authenticated = false;
  let callbackOrigin = '';
  let operationRetained = false;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    let status = 200;
    if (path.endsWith('/auth/session')) body = authenticated ? publicSession : { authenticated: false };
    else if (path.endsWith('/register/google/intent')) {
      counts.intents++;
      body = { operation_id: operationId };
    } else if (path.endsWith('/google/register') || path.endsWith('/google/session')) {
      counts.handoffs++;
      const input = route.request().postDataJSON();
      expect(input.access_token ?? input.accessToken).toBe(accessToken);
      if (path.endsWith('/google/register')) expect(input.operation_id).toBe(operationId);
      if (failFirstHandoff && counts.handoffs === 1) {
        status = 503; body = { message: 'No se pudo completar el registro. Volvé a intentarlo.' };
      } else { authenticated = true; body = path.endsWith('/google/register') ? appSession : publicSession; }
    } else if (path.endsWith('/recover')) body = appSession;
    else if (path.endsWith('/invitations/resolve')) body = {
      organization_display_name: 'PKCE Org', email_masked: 'a***@example.test',
      intended_role: 'member', expires_at: '2030-01-01T00:00:00Z',
    };
    else if (path.endsWith('/context')) body = {
      organization: { id: 'org-1', slug: 'pkce-org', display_name: 'PKCE Org', status: 'active' },
      membership: { id: 'member-1', organization_id: 'org-1', user_id: user.id, role: 'owner', status: 'active', version: 1 },
      capabilities: [],
    };
    else body = { items: [] };
    await route.fulfill({ status, json: body });
  });
  await page.route('https://pkce-test.supabase.co/auth/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/authorize')) {
      counts.authorizations++;
      const callback = new URL(url.searchParams.get('redirect_to')!);
      callbackOrigin = callback.origin;
      operationRetained = callback.searchParams.get('self_service_operation') === operationId;
      const code = `google-code-${counts.authorizations}`;
      challenges.set(code, url.searchParams.get('code_challenge')!);
      callback.searchParams.set('code', code);
      await route.fulfill({ contentType: 'text/html', body:
        `<main><p>Google OAuth test provider</p><a href="${callback.toString().replaceAll('&', '&amp;')}">Return from Google</a></main>` });
    } else if (url.pathname.endsWith('/token')) {
      counts.exchanges++;
      expect(url.searchParams.get('grant_type')).toBe('pkce');
      const input = route.request().postDataJSON();
      expect(createHash('sha256').update(input.code_verifier).digest('base64url')).toBe(challenges.get(input.auth_code));
      challenges.delete(input.auth_code);
      await route.fulfill({ json: { access_token: accessToken, refresh_token: 'temporary-refresh-token',
        token_type: 'bearer', expires_in: 3600, user: { ...user, aud: 'authenticated' } } });
    } else if (url.pathname.endsWith('/logout')) {
      counts.logouts++;
      expect(url.searchParams.get('scope')).toBe('local');
      await route.fulfill({ status: 204 });
    } else await route.abort();
  });
  return { counts, callback: () => ({ origin: callbackOrigin, operationRetained }) };
}

async function startRegistration(page: Page) {
  await page.goto('/register');
  await page.getByLabel(/Nombre completo/).fill('Ana');
  await page.getByLabel(/Correo electrónico/).fill(user.email);
  await page.getByLabel(/Nombre de la organización/).fill('PKCE Org');
  await page.getByLabel(/Acepto los términos/).check();
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page.getByText('Google OAuth test provider')).toBeVisible();
}

async function finishRegistration(page: Page) {
  await page.getByRole('link', { name: 'Return from Google' }).click();
  await expect(page).toHaveURL(/\/t\/pkce-org$/);
  await expect(page.getByText('Gestión de Propiedades', { exact: true })).toBeVisible();
}

test('Google registration survives the first return with a stale Supabase session', async ({ page, baseURL }) => {
  await page.addInitScript(key => {
    if (location.protocol !== 'http:') return;
    localStorage.setItem(key, JSON.stringify({ access_token: 'invalid-old-session' }));
  }, storageKey);
  const flow = await mockFlow(page);
  await startRegistration(page);
  expect(flow.callback()).toEqual({ origin: new URL(baseURL!).origin, operationRetained: true });
  await finishRegistration(page);
  expect(flow.counts).toEqual({ intents: 1, authorizations: 1, exchanges: 1, handoffs: 1, logouts: 1 });
  expect(await page.evaluate(key => ({
    verifier: sessionStorage.getItem(`${key}-code-verifier`),
    operation: sessionStorage.getItem('form_site_self_service_operation'),
    persistedToken: [...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => value.includes('temporary-refresh-token')),
  }), storageKey)).toEqual({ verifier: null, operation: null, persistedToken: false });
});

test('a second tab completing OAuth cannot delete the first tab verifier', async ({ context, page }) => {
  const first = await mockFlow(page);
  await startRegistration(page);
  const secondPage = await context.newPage();
  const second = await mockFlow(secondPage);
  await startRegistration(secondPage);
  await finishRegistration(secondPage);
  await finishRegistration(page);
  expect(first.counts.exchanges).toBe(1);
  expect(second.counts.exchanges).toBe(1);
});

test('a missing verifier can restart Google while retaining the registration operation', async ({ page }) => {
  await page.addInitScript(key => {
    if (location.pathname !== '/auth/callback' || sessionStorage.getItem('cleared-once')) return;
    sessionStorage.removeItem(`${key}-code-verifier`);
    sessionStorage.setItem('cleared-once', 'true');
  }, storageKey);
  const flow = await mockFlow(page);
  await startRegistration(page);
  await page.getByRole('link', { name: 'Return from Google' }).click();
  await expect(page.getByText(/El acceso con Google venció o se perdió/)).toBeVisible();
  expect(new URL(page.url()).searchParams.has('code')).toBe(false);
  expect(flow.counts.exchanges).toBe(0);
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page.getByText('Google OAuth test provider')).toBeVisible();
  expect(flow.callback().operationRetained).toBe(true);
  await finishRegistration(page);
  expect(flow.counts.intents).toBe(1);
  expect(flow.counts.authorizations).toBe(2);
  expect(flow.counts.exchanges).toBe(1);
});

test('backend retry completes registration without reusing the authorization code', async ({ page }) => {
  const flow = await mockFlow(page, true);
  await startRegistration(page);
  await page.getByRole('link', { name: 'Return from Google' }).click();
  await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('code')).toBe(false);
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page).toHaveURL(/\/t\/pkce-org$/);
  expect(flow.counts.exchanges).toBe(1);
  expect(flow.counts.handoffs).toBe(2);
});

test('reload after a failed backend handoff requires a fresh Google code', async ({ page }) => {
  const flow = await mockFlow(page, true);
  await startRegistration(page);
  await page.getByRole('link', { name: 'Return from Google' }).click();
  await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
  expect(flow.counts.exchanges).toBe(1);
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page.getByText('Google OAuth test provider')).toBeVisible();
  await finishRegistration(page);
  expect(flow.counts.exchanges).toBe(2);
  expect(flow.counts.handoffs).toBe(2);
});

test('normal Google login reaches the organization chooser', async ({ page }) => {
  const flow = await mockFlow(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await page.getByRole('link', { name: 'Return from Google' }).click();
  await expect(page.getByRole('heading', { name: 'Elegí una organización' })).toBeVisible();
  expect(flow.counts.intents).toBe(0);
  expect(flow.counts.exchanges).toBe(1);
  expect(flow.counts.handoffs).toBe(1);
});

test('Google login from an invitation returns to its acceptance screen', async ({ page }) => {
  const flow = await mockFlow(page);
  await page.goto('/invitations/accept');
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await page.getByRole('link', { name: 'Return from Google' }).click();
  await expect(page).toHaveURL(/\/invitations\/accept$/);
  await expect(page.getByRole('button', { name: 'Aceptar invitación', exact: true })).toBeVisible();
  expect(flow.counts.intents).toBe(0);
  expect(flow.counts.exchanges).toBe(1);
  expect(flow.counts.handoffs).toBe(1);
});
