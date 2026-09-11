import { expect, test } from '@playwright/test';

test('SPEC-39 browser → API → PostgREST → PostgreSQL', async ({ page }) => {
  test.skip(process.env.SPEC39_LIVE_DATABASE !== '1', 'Requires the documented disposable SPEC-39 database harness');
  await page.goto('/api/test-session');
  await page.goto('/t/azar/arrangements');
  await expect(page.getByRole('listitem')).toHaveCount(25);
  await expect(page.getByRole('option', { name: 'En curso' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Cargar más' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(27);
  await expect(page.getByRole('main')).not.toContainText('Solo Solar');
  await expect(page.getByRole('main')).not.toContainText('Orden cerrada');
  await page.getByRole('combobox').selectOption('in_progress');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('listitem')).toContainText('50000000-0000-4000-8000-000000000027');
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.getByRole('button', { name: 'Generar propiedad' }).click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(page).toHaveURL('/t/azar/arrangements');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  expect(requests).toEqual([]);
  const denied = await page.request.get('/api/organizations/20000000-0000-4000-8000-000000000002/arrangements/orders');
  expect(denied.status()).toBe(404);
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page).toHaveURL('/t/azar');
});
