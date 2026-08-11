import { expect, test } from '@playwright/test';
import {
  mockAgent,
  mockMedia,
  mockProperty,
  mockSubmission,
} from './fixtures/property';

test('submits a property with media and shows the success receipt', async ({ page }) => {
  let presignPayload: Record<string, unknown> | null = null;
  let submittedPayload: Record<string, unknown> | null = null;
  let uploadedBytes = 0;

  await page.addInitScript((agent) => {
    window.localStorage.setItem('form_site_agent', JSON.stringify(agent));
  }, mockAgent);

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        user: {
          id: mockAgent.agent_user_id,
          email: mockAgent.agent_email,
          name: mockAgent.agent_name,
        },
      }),
    });
  });

  await page.route('**/properties/media/presign', async (route) => {
    presignPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        upload_session_id: mockMedia.uploadSessionId,
        media_uploads: [
          {
            originalName: mockMedia.name,
            uploadUrl: mockMedia.uploadUrl,
            publicPath: mockMedia.publicPath,
            storagePath: mockMedia.storagePath,
            storageBucket: mockMedia.storageBucket,
          },
        ],
      }),
    });
  });

  await page.route('https://storage.mock/**', async (route) => {
    uploadedBytes = route.request().postDataBuffer()?.byteLength ?? 0;
    await route.fulfill({ status: 200, body: '' });
  });

  await page.route('**/properties/submit', async (route) => {
    submittedPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSubmission),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Agregar nueva propiedad' }).click();

  await expect(page.getByRole('heading', { name: 'Nueva propiedad' })).toBeVisible();
  await expect(page.getByRole('button', { name: mockAgent.agent_name })).toBeVisible();

  await page.locator('[name="Tipo de Inmueble"]').selectOption(mockProperty.type);
  await page.locator(`[name="Operación"][value="${mockProperty.operation}"]`).check();
  await page.locator('[name="Precio"]').fill(mockProperty.price);
  await page.locator('[name="Expensas"]').fill(mockProperty.expenses);
  await page.locator(`[name="Moneda"][value="${mockProperty.currency}"]`).check();
  await page.locator('[name="Propietario"]').fill(mockProperty.owner);
  await page.locator('[name="Asesor comercial"]').fill(mockProperty.adviser);
  await page.locator('[name="Sucursal"]').fill(mockProperty.branch);
  await page.locator('[name="Tipo de contrato"]').selectOption(mockProperty.contractType);

  await page.locator('[name="Provincia"]').selectOption(mockProperty.province);
  await page.locator('[name="Localidad"]').fill(mockProperty.locality);
  await page.locator('[name="Barrio"]').fill(mockProperty.neighborhood);
  await page.locator('[name="Calle"]').fill(mockProperty.street);
  await page.locator('[name="Numero"]').fill(mockProperty.streetNumber);

  await page.locator('[name="Dormitorios"]').selectOption(mockProperty.bedrooms);
  await page.locator('[name="Ambientes"]').selectOption(mockProperty.rooms);
  await page.locator('[name="Baños"]').selectOption(mockProperty.bathrooms);
  await page.locator('[name="Plantas"]').selectOption(mockProperty.floors);
  await page.locator('[name="Antiguedad"]').selectOption(mockProperty.age);
  await page.locator('[name="Metros cubiertos"]').fill(mockProperty.coveredMeters);

  for (const feature of mockProperty.features) {
    await page.getByRole('checkbox', { name: feature, exact: true }).check({ force: true });
  }

  await page.locator('[name="Titulo"]').fill(mockProperty.title);
  await page.locator('[name="Observaciones"]').fill(mockProperty.observations);
  await page.locator('[name="Detalle"]').fill(mockProperty.detail);
  await page.locator('[name="Notas Privadas"]').fill(mockProperty.privateNotes);

  await page.locator('input[type="file"]').setInputFiles({
    name: mockMedia.name,
    mimeType: mockMedia.mimeType,
    buffer: Buffer.from(mockMedia.body),
  });
  await expect(page.getByText(mockMedia.name)).toBeVisible();
  await expect(page.getByText('★ portada')).toBeVisible();

  await page.getByRole('button', { name: 'Enviar propiedad' }).click();

  await expect(page).toHaveURL(`/properties/success/${mockSubmission.submission_id}`);
  await expect(page.getByRole('heading', { name: 'Propiedad enviada' })).toBeVisible();
  await expect(page.getByText(mockSubmission.property_id)).toBeVisible();
  await expect(page.getByText(mockSubmission.submission_id)).toBeVisible();
  await expect(page.getByText('Todos los pasos completados correctamente.')).toBeVisible();

  expect(presignPayload).toEqual({
    agent_user_id: mockAgent.agent_user_id,
    files: [
      {
        originalName: mockMedia.name,
        mimeType: mockMedia.mimeType,
        sizeBytes: mockMedia.body.length,
      },
    ],
  });
  expect(uploadedBytes).toBe(mockMedia.body.length);
  expect(submittedPayload).toMatchObject({
    agent_user_id: mockAgent.agent_user_id,
    agent_name: mockAgent.agent_name,
    agent_email: mockAgent.agent_email,
    cover_file_name: mockMedia.name,
    media_upload_session_id: mockMedia.uploadSessionId,
    'Tipo de Inmueble': mockProperty.type,
    'Operación': mockProperty.operation,
    Precio: Number(mockProperty.price),
    Provincia: mockProperty.province,
    Localidad: mockProperty.locality,
    Calle: mockProperty.street,
    Titulo: mockProperty.title,
  });
  expect(submittedPayload?.media_uploads).toEqual([
    {
      original_name: mockMedia.name,
      storage_path: mockMedia.storagePath,
      mime_type: mockMedia.mimeType,
      size_bytes: mockMedia.body.length,
      storage_bucket: mockMedia.storageBucket,
      public_path: mockMedia.publicPath,
    },
  ]);
});
