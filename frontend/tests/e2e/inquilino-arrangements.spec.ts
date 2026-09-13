import { test, expect, type Page } from '@playwright/test';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

// Real API/Postgres fixture harness; no route.fulfill for the successful flow.
test.skip(process.env.SPEC43_DATABASE_E2E !== '1', 'Requires disposable SPEC-43 database, PostgREST and API harness');
test.describe.configure({ mode: 'serial' });
// Each full flow signs in four separate users and verifies durable state changes.
test.setTimeout(60_000);
async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: false }).fill(email);
  await page.getByLabel('Contraseña', { exact: false }).fill('spec43-test-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.getByRole('link', { name: /Azar/ }).click();
}
async function logout(page: Page) {
  if (!page.url().startsWith('http://127.0.0.1:4173')) return;
  await page.evaluate(async () => {
    const cookie = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('form_site_csrf='));
    if (cookie) await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(cookie.slice('form_site_csrf='.length)) }, body: '{}' });
  });
}
test.afterEach(async ({ page }) => { await logout(page); });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');
for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`tenant → verified image/video → property history → status/archive/reopen at ${viewport.width}`, async ({ page, browser }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await login(page, 'inquilino@example.test');
    await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Solicitud de arreglo', exact: true }).click();
    await expect(page.getByLabel('Descripción del arreglo')).toBeFocused();
    const description = `Pérdida cocina ${viewport.width} ${Date.now()}`;
    await page.getByLabel('Descripción del arreglo').fill(description);
    await page.getByLabel('Imágenes y videos (opcional)').setInputFiles([{ name: 'prueba.png', mimeType: 'image/png', buffer: png }, { name: 'video.mp4', mimeType: 'video/mp4', buffer: readFileSync(new URL('../fixtures/media/repair-test.mp4', import.meta.url)) }]);
    await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
    await expect(page.getByText('Solicitud enviada.', { exact: false })).toBeVisible();
    const card = page.getByRole('article').filter({ hasText: description });
    await expect(card.getByText('Tu solicitud')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Descargar prueba.png' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('organizations/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`tenant-${viewport.width}.png`), fullPage: true });
    const otherContext = await browser.newContext({ viewport }); const other = await otherContext.newPage();
    await login(other, 'second@example.test');
    await expect(other.getByRole('article').filter({ hasText: description })).toBeVisible();
    await expect(other.getByRole('article').filter({ hasText: description }).getByText('Tu solicitud')).toHaveCount(0);
    await logout(other); await otherContext.close();
    const managerContext = await browser.newContext({ viewport }); const manager = await managerContext.newPage();
    await login(manager, 'reader@example.test'); await manager.goto('/t/azar/arrangements');
    const managed = manager.getByRole('article').filter({ hasText: description });
    await expect(managed.getByText('Casa Norte')).toBeVisible();
    for (const [value, label] of [['in_progress', 'En proceso'], ['solved', 'Solucionado'], ['archived', 'Archivada'], ['open', 'Sin procesar']]) {
      await managed.getByRole('combobox', { name: 'Estado de la solicitud' }).selectOption(value);
      await managed.getByRole('button', { name: 'Guardar estado' }).click();
      await expect(managed.locator('span').filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible();
      await expect(managed.getByRole('button', { name: 'Guardar estado' })).toBeDisabled();
    }
    await manager.getByRole('combobox', { name: 'Filtrar por estado' }).selectOption('archived');
    await expect(manager.getByText('No hay solicitudes con este estado.')).toBeVisible();
    await manager.getByRole('combobox', { name: 'Filtrar por estado' }).selectOption('');
    await expect(managed).toBeVisible();
    expect(await manager.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await manager.screenshot({ path: testInfo.outputPath(`internal-${viewport.width}.png`), fullPage: true });
    await logout(manager); await managerContext.close();
    const viewerContext = await browser.newContext(); const viewer = await viewerContext.newPage();
    await login(viewer, 'viewer@example.test'); await viewer.goto('/t/azar/arrangements');
    await expect(viewer.getByRole('button', { name: 'Guardar estado' })).toHaveCount(0);
    const viewResponse = viewer.waitForResponse(response => response.url().includes('/assets/') && response.url().endsWith('/view'));
    await viewer.getByRole('article').filter({ hasText: description }).getByRole('button', { name: 'Descargar prueba.png' }).click();
    const response = await viewResponse; expect(response.status()).toBe(200);
    const signed = await response.json(); expect(new Date(signed.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(60_000);
    expect((await viewer.request.get(signed.signed_url)).status()).toBe(200);
    await logout(viewer); await viewerContext.close();
    expect(errors).toEqual([]);
  });
}
test('failed upload preserves the form, retries the same draft, and cancellation restores focus', async ({ page }) => {
  await login(page, 'inquilino@example.test');
  const button = page.getByRole('button', { name: 'Solicitud de arreglo', exact: true });
  await button.click(); const description = `Retry ${Date.now()}`;
  await page.getByLabel('Descripción del arreglo').fill(description);
  await page.getByLabel('Imágenes y videos (opcional)').setInputFiles({ name: 'retry.png', mimeType: 'image/png', buffer: png });
  let failed = false;
  await page.route('**/spec43-storage/**', async route => {
    if (route.request().method() === 'PUT' && !failed) { failed = true; await route.abort('failed'); } else await route.continue();
  });
  const drafts: string[] = []; page.on('response', async response => {
    if (response.url().endsWith('/order-drafts') && response.status() === 201) drafts.push((await response.json()).id);
  });
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Descripción del arreglo')).toHaveValue(description);
  await expect(page.getByText('retry.png', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar envío' }).click();
  await expect(page.getByText('Solicitud enviada.', { exact: false })).toBeVisible();
  expect(new Set(drafts).size).toBe(1);
  await button.click(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(button).toBeFocused();
});

test('text-only submit survives a lost response without publishing a second request', async ({ page }) => {
  await login(page, 'inquilino@example.test');
  await page.getByRole('button', { name: 'Solicitud de arreglo', exact: true }).click();
  const description = `Respuesta perdida ${Date.now()}`;
  await page.getByLabel('Descripción del arreglo').fill(description);
  let submissions = 0;
  await page.route('**/order-drafts/*/submit', async route => {
    submissions++;
    const response = await route.fetch(); expect(response.status()).toBe(200);
    if (submissions === 1) await route.abort('failed'); else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Descripción del arreglo')).toHaveValue(description);
  await page.getByRole('button', { name: 'Reintentar envío' }).click();
  await expect(page.getByText('Solicitud enviada.', { exact: false })).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: description })).toHaveCount(1);
  expect(submissions).toBe(1);
});

test('cancelling a started upload expires the draft and publishes no request', async ({ page }) => {
  await login(page, 'inquilino@example.test');
  await page.getByRole('button', { name: 'Solicitud de arreglo', exact: true }).click();
  const description = `Cancelada ${Date.now()}`;
  await page.getByLabel('Descripción del arreglo').fill(description);
  await page.getByLabel('Imágenes y videos (opcional)').setInputFiles({ name: 'cancel.png', mimeType: 'image/png', buffer: png });
  await page.route('**/spec43-storage/**', route => route.request().method() === 'PUT' ? route.abort('failed') : route.continue());
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const cancelled = page.waitForResponse(response => response.url().endsWith('/cancel') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const response = await cancelled; expect(response.status()).toBe(200);
  expect((await response.json()).submission_state).toBe('expired');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('article').filter({ hasText: description })).toHaveCount(0);
});
