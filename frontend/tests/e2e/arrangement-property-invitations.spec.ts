import { execFileSync } from 'node:child_process';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { organizationContext, organizationSession } from '../fixtures/organizations';

const A = '20000000-0000-4000-8000-000000000001';
const B = '20000000-0000-4000-8000-000000000002';
const P = '60000000-0000-4000-8000-000000000001';
const managerCapabilities = ['organization.read', 'arrangements.read', 'arrangements.properties.create', 'arrangements.inquilinos.manage',
  'members.read', 'members.invite', 'members.manage_member'];

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`SPEC-42 property form keyboard and layout at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; let created = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/api/**', async route => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      if (path === '/api/auth/session') await route.fulfill({ json: organizationSession });
      else if (path.endsWith('/context')) await route.fulfill({ json: { ...organizationContext('azar'), capabilities: managerCapabilities } });
      else if (path.endsWith('/orders')) await route.fulfill({ json: { organization_id: A, items: [], available_statuses: [], next_cursor: null } });
      else if (path.endsWith('/properties') && request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({ name: 'Casa del parque' });
        expect(request.headers()['idempotency-key']).toBeTruthy(); created = true;
        await route.fulfill({ status: 201, json: { id: P, name: 'Casa del parque' } });
      } else await route.fulfill({ json: { organization_id: A, items: path.endsWith('/properties') && created ? [{ id: P, name: 'Casa del parque' }] : [], next_cursor: null } });
    });
    await page.goto('/t/azar/arrangements');
    const generate = page.getByRole('button', { name: 'Generar propiedad' });
    await generate.focus(); await page.keyboard.press('Enter');
    const input = page.getByLabel('Nombre de la propiedad');
    await expect(input).toBeFocused();
    await page.keyboard.press('Escape'); await expect(generate).toBeFocused();
    await generate.press('Space'); await input.fill('Casa del parque');
    await page.screenshot({ path: testInfo.outputPath('create-property.png'), fullPage: true });
    await page.getByRole('button', { name: 'Crear propiedad' }).click();
    await expect(page.getByRole('dialog', { name: 'Agregar inquilino' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText(P)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('property-panel.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('list', { name: 'Propiedades' }).getByText('Casa del parque')).toBeVisible();
    await page.getByRole('link', { name: 'Inicio', exact: true }).click();
    await expect(page).toHaveURL('/t/azar'); expect(errors).toEqual([]);
  });
}

function sql(query: string) {
  const uri = process.env.SPEC42_TEST_DATABASE_URL!;
  if (!['localhost', '127.0.0.1'].includes(new URL(uri).hostname)) throw new Error('Disposable loopback database required');
  return execFileSync(process.env.SPEC42_PSQL ?? 'psql', [uri, '-XAtq', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8' }).trim();
}
async function login(page: Page, email: string, password: string) {
  await page.goto('/login'); await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: false }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/');
}
async function invite(page: Page, email: string) {
  await page.getByRole('button', { name: 'Invitar por correo' }).click();
  await page.getByLabel('Correo electrónico').fill(email);
  const response = page.waitForResponse(r => /\/arrangements\/properties\/[^/]+\/invitations$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Generar invitación' }).click();
  const result = await response; expect(result.status()).toBe(201);
  return (await result.json()) as { share_url: string; invitation_id: string; arrangement_property_id: string };
}
async function accept(browser: Browser, link: string, propertyId: string, organizationSlug: string, email: string, isNew: boolean) {
  const context = await browser.newContext();
  const page = await context.newPage(); await page.goto(link);
  await expect(page.getByText(propertyId, { exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  expect(await page.getByRole('combobox').count()).toBe(0);
  if (isNew) {
    await page.getByLabel(/^Nombre/).fill('Inquilino de prueba');
    await page.getByLabel(/^Contraseña/).fill('invited-test-password');
    await page.getByLabel('Confirmar contraseña').fill('invited-test-password');
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  } else {
    await page.getByRole('tab', { name: 'Iniciar sesión' }).click();
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel(/^Contraseña/).fill('existing-test-password');
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Aceptar invitación', exact: true }).click();
  await expect(page).toHaveURL(`/t/${organizationSlug}/inquilino`);
  await expect(page.getByRole('main')).toHaveText('Inicio');
  return { context, page };
}

test('SPEC-42 real database: create → register/login → atomic association → reload and isolation', async ({ page, browser }, testInfo) => {
  test.skip(process.env.SPEC42_LIVE_DATABASE !== '1', 'Requires the disposable SPEC-42 PostgreSQL/PostgREST/API harness');
  test.setTimeout(120_000);
  const contexts: BrowserContext[] = [];
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    const initialUsers = sql('select count(*) from auth.users;');
    await login(page, 'owner@example.test', 'owner-test-password');
    await page.goto('/t/azar/arrangements');
    await expect(page.getByText('Ventana', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Generar propiedad' }).click();
    await page.getByLabel('Nombre de la propiedad').fill('Casa compartida');
    const create = page.waitForResponse(r => r.url().endsWith('/arrangements/properties') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Crear propiedad' }).click();
    const property = await (await create).json(); expect(property.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByRole('dialog').getByText(property.id)).toBeVisible();
    expect(sql(`select name from public.arrangement_properties where id='${property.id}';`)).toBe('Casa compartida');
    await page.getByRole('button', { name: 'Asociar existente' }).click();
    await page.getByRole('button', { name: 'Asociar legacy', exact: true }).click();
    await expect(page.getByText('legacy · Inquilino activo')).toBeVisible();
    expect(sql(`select arrangement_property_id from public.organization_memberships where id='30000000-0000-4000-8000-000000000007';`)).toBe(property.id);
    const fresh = await invite(page, 'inquilino@example.test');
    expect(fresh.arrangement_property_id).toBe(property.id);
    expect(sql("select count(*) from public.organization_memberships where user_id='10000000-0000-4000-8000-000000000005';")).toBe('0');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copiar enlace' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(fresh.share_url);
    const freshUser = await accept(browser, fresh.share_url, property.id, 'azar', 'inquilino@example.test', true); contexts.push(freshUser.context);
    expect(sql(`select arrangement_property_id from public.organization_memberships where organization_id='${A}' and user_id='10000000-0000-4000-8000-000000000005';`)).toBe(property.id);
    await freshUser.page.reload(); await expect(freshUser.page.getByRole('main')).toHaveText('Inicio');
    await freshUser.page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await login(freshUser.page, 'inquilino@example.test', 'invited-test-password');
    await freshUser.page.goto('/t/azar'); await expect(freshUser.page).toHaveURL('/t/azar/inquilino');
    expect((await freshUser.context.request.get(`/api/organizations/${A}/arrangements/properties`)).status()).toBe(403);
    expect((await freshUser.context.request.get(`/api/organizations/${B}/context`)).status()).toBe(404);
    const existing = await invite(page, 'existing@example.test');
    const existingUser = await accept(browser, existing.share_url, property.id, 'azar', 'existing@example.test', false); contexts.push(existingUser.context);
    expect(sql(`select count(*) from public.organization_memberships where arrangement_property_id='${property.id}' and role='inquilino' and status='active';`)).toBe('3');
    expect(sql('select count(*) from auth.users;')).toBe(initialUsers);
    await page.getByRole('button', { name: 'Actualizar inquilinos' }).click();
    await expect(page.getByText('existing · Inquilino activo')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('persisted-inquilinos.png'), fullPage: true });
    await page.getByRole('button', { name: 'Cerrar diálogo' }).click(); await page.reload();
    await expect(page.getByRole('list', { name: 'Propiedades' }).getByText(property.id)).toBeVisible();
    // The same global identity joins B through a different membership and property.
    const solar = await browser.newContext(); contexts.push(solar); const solarPage = await solar.newPage();
    await login(solarPage, 'solar-owner@example.test', 'existing-test-password'); await solarPage.goto('/t/solar/arrangements');
    await solarPage.getByRole('button', { name: 'Generar propiedad' }).click(); await solarPage.getByLabel('Nombre de la propiedad').fill('Casa Solar');
    const solarCreate = solarPage.waitForResponse(r => r.url().endsWith('/arrangements/properties') && r.request().method() === 'POST');
    await solarPage.getByRole('button', { name: 'Crear propiedad' }).click(); const solarProperty = await (await solarCreate).json();
    const solarInvite = await invite(solarPage, 'existing@example.test');
    const solarUser = await accept(browser, solarInvite.share_url, solarProperty.id, 'solar', 'existing@example.test', false); contexts.push(solarUser.context);
    expect(sql("select count(distinct arrangement_property_id) from public.organization_memberships where user_id='10000000-0000-4000-8000-000000000008';")).toBe('2');
    // Read-only users receive property names/IDs without people queries or controls.
    for (const name of ['reader', 'viewer']) {
      const reader = await browser.newContext(); contexts.push(reader); const readerPage = await reader.newPage();
      const people: string[] = []; readerPage.on('request', r => { if (/arrangements.*(?:invitations|inquilinos)/.test(r.url())) people.push(r.url()); });
      await login(readerPage, `${name}@example.test`, 'existing-test-password'); await readerPage.goto('/t/azar/arrangements');
      await expect(readerPage.getByText('Casa compartida')).toBeVisible();
      await expect(readerPage.getByRole('button', { name: 'Generar propiedad' })).toHaveCount(0);
      await expect(readerPage.getByRole('button', { name: /Agregar inquilino/ })).toHaveCount(0); expect(people).toEqual([]);
    }
    expect(errors).toEqual([]);
  } finally { for (const context of contexts) await context.close(); }
});
