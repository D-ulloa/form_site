import { expect, test } from '@playwright/test';
import process from 'node:process';
import { mockAgent, mockMedia, mockProperty } from './fixtures/property';

test.skip(
  process.env.PLAYWRIGHT_LIVE !== '1',
  'Set PLAYWRIGHT_LIVE=1 to allow a real hosted submission.',
);

test('live: submits marked test property data through the Vercel production backend', async ({ page }) => {
  const runId = Date.now().toString(36).toUpperCase();
  const fileName = `casa-frente-vercel-e2e-${runId}.jpg`;
  const title = `[E2E VERCEL ${runId}] ${mockProperty.title}`;
  const browserErrors: string[] = [];

  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.addInitScript((agent) => {
    window.localStorage.setItem('form_site_agent', JSON.stringify(agent));
  }, {
    ...mockAgent,
    agent_user_id: 'agent-vercel-e2e',
    agent_name: 'Prueba E2E Vercel',
    agent_email: 'e2e-vercel@example.com',
  });

  await page.goto('/properties/new');
  await expect(page.getByRole('heading', { name: 'Nueva propiedad' })).toBeVisible();

  await page.locator('[name="Tipo de Inmueble"]').selectOption(mockProperty.type);
  await page.locator(`[name="Operación"][value="${mockProperty.operation}"]`).check();
  await page.locator('[name="Precio"]').fill('1');
  await page.locator(`[name="Moneda"][value="${mockProperty.currency}"]`).check();
  await page.locator('[name="Propietario"]').fill(`PRUEBA AUTOMATIZADA ${runId}`);
  await page.locator('[name="Provincia"]').selectOption(mockProperty.province);
  await page.locator('[name="Localidad"]').fill(mockProperty.locality);
  await page.locator('[name="Barrio"]').fill('E2E - NO PUBLICAR');
  await page.locator('[name="Calle"]').fill('CALLE DE PRUEBA E2E');
  await page.locator('[name="Numero"]').fill('0');
  await page.locator('[name="Dormitorios"]').selectOption('1');
  await page.locator('[name="Ambientes"]').selectOption('1');
  await page.locator('[name="Baños"]').selectOption('1');
  await page.locator('[name="Titulo"]').fill(title);
  await page.locator('[name="Observaciones"]').fill(
    `PRUEBA E2E AUTOMATIZADA ${runId}. NO PUBLICAR NI CONTACTAR.`,
  );
  await page.locator('[name="Notas Privadas"]').fill(
    `Registro generado contra Vercel para verificar el flujo de producción. Run: ${runId}.`,
  );

  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: mockMedia.mimeType,
    buffer: Buffer.from(mockMedia.body),
  });
  await expect(page.getByText(fileName)).toBeVisible();

  const submitResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/_/backend/properties/submit'),
    { timeout: 60_000 },
  );

  await page.getByRole('button', { name: 'Enviar propiedad' }).click();
  const submitResponse = await submitResponsePromise;
  const responseBody = await submitResponse.json() as Record<string, unknown>;

  expect(submitResponse.status(), JSON.stringify(responseBody)).toBe(200);
  expect(responseBody).toMatchObject({
    outcome: 'success',
    upload_strategy: 'supabase',
    supabase_object_count: 1,
  });

  const submissionId = String(responseBody.submission_id);
  const propertyId = String(responseBody.property_id);
  await expect(page).toHaveURL(`/properties/success/${submissionId}`);
  await expect(page.getByRole('heading', { name: 'Propiedad enviada' })).toBeVisible();
  await expect(page.getByText(propertyId)).toBeVisible();
  expect(browserErrors).toEqual([]);

  console.log(JSON.stringify({ runId, propertyId, submissionId, title }));
});
