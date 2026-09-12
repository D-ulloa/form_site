import { expect, test } from '@playwright/test';
import { organizationContext, organizationSession } from '../fixtures/organizations';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`inquilino exclusive home and navigation at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const unexpected: string[] = [];
    const errors: string[] = [];
    let denied = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/session') {
        await route.fulfill({ json: { ...organizationSession, user: { ...organizationSession.user,
          email: 'inquilino-con-un-correo-muy-largo-para-probar@example.test' } } });
      } else if (path.endsWith('/context')) {
        const context = organizationContext('azar');
        await route.fulfill({ json: { ...context, membership: { ...context.membership, role: 'inquilino' },
          capabilities: denied ? [] : ['inquilino.home.read'], home_destination: denied ? null : 'inquilino' } });
      } else { unexpected.push(path); await route.fulfill({ status: 500 }); }
    });
    await page.goto('/t/azar');
    await expect(page).toHaveURL('/t/azar/inquilino');
    await expect(page.getByRole('main')).toHaveText('Inicio');
    await expect(page.getByRole('button')).toHaveCount(1);
    await expect(page.getByRole('link')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cerrar sesión' }).focus();
    expect(await page.getByRole('button').evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('inquilino-home.png'), fullPage: true });
    await page.reload();
    await expect(page.getByRole('main')).toHaveText('Inicio');
    for (const path of ['arrangements', 'contracts/admin', 'properties/new', 'settings/members']) {
      await page.goto(`/t/azar/${path}`);
      await expect(page).toHaveURL('/t/azar/inquilino');
      await expect(page.getByRole('main')).toHaveText('Inicio');
    }
    denied = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('heading', { name: 'Elegí una organización' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toHaveCount(0);
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('SPEC-40 invitation → registration → persisted membership → login → revocation', async ({ page, browser }) => {
  test.setTimeout(60_000);
  test.skip(process.env.SPEC40_LIVE_DATABASE !== '1', 'Requires the documented disposable SPEC-40 database harness');
  const a = '20000000-0000-4000-8000-000000000001';
  const user = '10000000-0000-4000-8000-000000000005';
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('owner@example.test');
  await page.getByLabel('Contraseña', { exact: false }).fill('owner-test-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.getByRole('link', { name: /Azar/ }).click();
  await page.getByRole('link', { name: 'Miembros', exact: true }).click();
  await page.getByLabel('Correo electrónico').fill('inquilino@example.test');
  await page.getByRole('combobox').selectOption('inquilino');
  const receiptPromise = page.waitForResponse(response => response.url().endsWith(`/organizations/${a}/invitations`) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Crear enlace' }).click();
  const receipt = await (await receiptPromise).json();
  expect(receipt.share_url).toContain('/invitations/accept#invitation_token=');
  const invitedContext = await browser.newContext();
  try {
    const invitedPage = await invitedContext.newPage();
    await invitedPage.goto(receipt.share_url);
    await expect(invitedPage.getByText('inquilino', { exact: true })).toBeVisible();
    await invitedPage.getByLabel('Nombre', { exact: false }).fill('Cliente de prueba');
    await invitedPage.getByLabel('Contraseña', { exact: false }).first().fill('invited-test-password');
    await invitedPage.getByLabel('Confirmar contraseña').fill('invited-test-password');
    await invitedPage.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
    await invitedPage.getByRole('button', { name: 'Aceptar invitación', exact: true }).click();
    await expect(invitedPage).toHaveURL('/t/azar/inquilino');
    await expect(invitedPage.getByRole('main')).toHaveText('Inicio');
    const context = await (await invitedContext.request.get(`/api/organizations/${a}/context`)).json();
    expect(context.membership.role).toBe('inquilino');
    expect(context.capabilities).toEqual(['inquilino.home.read']);
    expect((await invitedContext.request.get(`/api/organizations/${a}/members`)).status()).toBe(403);
    expect((await invitedContext.request.get('/api/organizations/solar/context')).status()).toBe(404);
    await invitedPage.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(invitedPage).toHaveURL('/login');
    await invitedPage.getByLabel('Correo electrónico').fill('inquilino@example.test');
    await invitedPage.getByLabel('Contraseña', { exact: false }).fill('invited-test-password');
    await invitedPage.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await invitedPage.getByRole('link', { name: /Azar/ }).click();
    await expect(invitedPage).toHaveURL('/t/azar/inquilino');
    const cookies = await page.context().cookies();
    const csrf = cookies.find(cookie => cookie.name === 'form_site_csrf')!.value;
    const suspend = await page.request.post(`/api/organizations/${a}/members/${user}/suspend`, {
      headers: { Origin: 'http://127.0.0.1:4173', 'X-CSRF-Token': csrf }, data: { expected_version: context.membership.version, reason_code: 'test' },
    });
    expect(suspend.status()).toBe(200);
    await invitedPage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(invitedPage).toHaveURL('/');
    await expect(invitedPage.getByRole('heading', { name: 'Inicio', exact: true })).toHaveCount(0);
    expect((await invitedContext.request.get(`/api/organizations/${a}/context`)).status()).toBe(404);
  } finally { if (browser.isConnected()) await invitedContext.close(); }
});
