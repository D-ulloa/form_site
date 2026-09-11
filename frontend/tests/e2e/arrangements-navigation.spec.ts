import { expect, test, type Locator, type Page } from '@playwright/test';
import { organizationContext, organizationSession } from '../fixtures/organizations';

async function mockOrganizationAccess(page: Page, authenticated = true) {
  const unexpectedRequests: string[] = [];
  const requestedPaths: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requestedPaths.push(path);
    if (request.method() === 'GET' && path === '/api/auth/session') {
      await route.fulfill({ json: authenticated ? organizationSession : { authenticated: false } });
    } else if (authenticated && request.method() === 'GET' && /^\/api\/organizations\/(azar|solar)\/context$/u.test(path)) {
      await route.fulfill({ json: organizationContext(path.includes('/azar/') ? 'azar' : 'solar') });
    } else {
      unexpectedRequests.push(`${request.method()} ${path}`);
      await route.fulfill({ status: 500, json: { message: 'Unexpected request in arrangement navigation' } });
    }
  });
  return { unexpectedRequests, requestedPaths };
}

async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  expect(await locator.evaluate(element => {
    const style = getComputedStyle(element);
    return element.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  })).toBe(true);
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  test(`arrangement navigation and empty shell at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const { unexpectedRequests, requestedPaths } = await mockOrganizationAccess(page);
    const browserErrors: string[] = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });

    await page.goto('/t/azar');
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
      'Agregar nueva propiedad', 'Generar contrato', 'Administrar contratos', 'Gestión de arreglos',
    ]);
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('organization-home.png'), fullPage: true });

    await page.getByRole('button', { name: 'Administrar contratos', exact: true }).focus();
    await page.keyboard.press('Tab');
    const arrangements = page.getByRole('button', { name: 'Gestión de arreglos', exact: true });
    await expectVisibleFocus(arrangements);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/t/azar/arrangements');
    const home = page.getByRole('link', { name: 'Inicio', exact: true });
    await expect(home).toBeVisible();
    await expect(home).toHaveAttribute('href', '/t/azar');
    await expect(page.getByRole('main')).toBeEmpty();
    await expect(page.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('link')).toHaveCount(1);
    await expectNoOverflow(page);
    await page.keyboard.press('Tab');
    await expectVisibleFocus(home);
    await page.screenshot({ path: testInfo.outputPath('arrangements-placeholder.png'), fullPage: true });

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/t/azar');
    await expect(arrangements).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL('/t/azar/arrangements');
    await expect(home).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL('/t/azar');
    await expect(arrangements).toBeVisible();
    expect(unexpectedRequests).toEqual([]);
    expect(new Set(requestedPaths)).toEqual(new Set(['/api/auth/session', '/api/organizations/azar/context']));
    expect(browserErrors).toEqual([]);
  });
}

test('direct entry and reload preserve the second organization', async ({ page }) => {
  const { unexpectedRequests } = await mockOrganizationAccess(page);
  await page.goto('/t/solar/arrangements');
  const home = page.getByRole('link', { name: 'Inicio', exact: true });
  await expect(home).toHaveAttribute('href', '/t/solar');
  await page.reload();
  await expect(home).toHaveAttribute('href', '/t/solar');
  await expect(page.getByRole('main')).toBeEmpty();
  await home.click();
  await expect(page).toHaveURL('/t/solar');
  await page.getByRole('button', { name: 'Gestión de arreglos', exact: true }).click();
  await expect(page).toHaveURL('/t/solar/arrangements');
  expect(unexpectedRequests).toEqual([]);
});

test('anonymous direct entry uses the existing login redirect', async ({ page }) => {
  const { unexpectedRequests, requestedPaths } = await mockOrganizationAccess(page, false);
  await page.goto('/t/solar/arrangements');
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { name: 'Iniciá sesión' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inicio', exact: true })).toHaveCount(0);
  expect(new Set(requestedPaths)).toEqual(new Set(['/api/auth/session']));
  expect(unexpectedRequests).toEqual([]);
});
