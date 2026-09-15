import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
test.describe.configure({ mode: 'serial' });
const database = process.env.SPEC45_BROWSER_DATABASE_URL;
if (database && (!['127.0.0.1', 'localhost'].includes(new URL(database).hostname) || !new URL(database).pathname.startsWith('/spec45'))) throw new Error('Disposable spec45 database required');
const org = '20000000-0000-4000-8000-000000000001';
const owner = '30000000-0000-4000-8000-000000000001';
const person = '30000000-0000-4000-8000-000000000009';
const second = '30000000-0000-4000-8000-000000000013';
const tenantId = '30000000-0000-4000-8000-000000000010';
const base = `/api/organizations/${org}/arrangements`;
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
function sql(statement: string) { return execFileSync(process.env.SPEC45_PSQL ?? 'psql', [database!, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-c', statement], { encoding: 'utf8' }).trim(); }
async function login(page: Page, email: string) {
  await page.goto('/login'); await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: false }).fill('spec45-test-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Elegí una organización' })).toBeVisible();
}
async function headers(context: BrowserContext) {
  const csrf = (await context.cookies()).find(cookie => cookie.name === 'form_site_csrf')!.value;
  return { Origin: 'http://127.0.0.1:4173', 'X-CSRF-Token': decodeURIComponent(csrf), 'X-Arrangement-Contract': '3' };
}
function rpc(action: string, body: unknown) { return `select public.spec45_arrangements('${org}','${owner}',${q(action)},${q(JSON.stringify(body))},'spec45-browser')`; }
test('SPEC45 real multi-session assignment, private files, rejection and recovery', async ({ browser }, info) => {
  test.skip(!database, 'Requires disposable SPEC45 database and API'); test.setTimeout(90_000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext(), browser.newContext()]);
  const [manager, tenant, personal, other] = await Promise.all(contexts.map(context => context.newPage()));
  const errors: string[] = []; for (const page of [manager, tenant, personal, other]) page.on('pageerror', error => errors.push(error.message));
  try {
    await Promise.all([login(manager, 'owner@example.test'), login(tenant, 'tenant@example.test'), login(personal, 'personal@example.test'), login(other, 'personal-two@example.test')]);
    await Promise.all([manager.goto('/t/azar/arrangements'), tenant.goto('/t/azar/inquilino'), personal.goto('/t/azar/personal'), other.goto('/t/azar/personal')]);
    await expect(personal.getByText('No tenés órdenes asignadas')).toBeVisible();
    await tenant.getByRole('button', { name: 'Solicitud de arreglo', exact: true }).click();
    const description = `SPEC45 filtración ${Date.now()}`;
    const dialog = tenant.getByRole('dialog'); await dialog.getByLabel('Descripción', { exact: false }).fill(description);
    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'repair.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64') });
    const submitted = tenant.waitForResponse(response => response.url().endsWith('/submit') && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
    const receipt = await submitted; expect(receipt.status()).toBe(200); const order = await receipt.json();
    const card = manager.locator('article').filter({ hasText: description });
    await expect(card).toBeVisible(); await card.getByRole('button', { name: 'Asignar personal', exact: true }).click();
    const assignment = manager.getByRole('dialog'); await assignment.getByLabel('Personal responsable').selectOption(person);
    const assigned = manager.waitForResponse(response => response.url().endsWith('/assignment') && response.request().method() === 'PATCH');
    await assignment.getByRole('button', { name: 'Guardar asignación' }).click();
    const assignedResponse = await assigned; expect(assignedResponse.status()).toBe(200); const assignedOrder = await assignedResponse.json();
    await expect(personal.getByText(description, { exact: true })).toBeVisible({ timeout: 2000 });
    await expect(tenant.locator('article').filter({ hasText: description }).getByText('En proceso', { exact: true })).toBeVisible({ timeout: 2000 });
    const assignLatency = Date.now() - Date.parse(assignedOrder.updated_at); expect(assignLatency).toBeLessThan(2000);
    await expect(other.getByText(description, { exact: true })).toHaveCount(0);
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await personal.setViewportSize(viewport); expect(await personal.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await personal.screenshot({ path: info.outputPath(`personal-${viewport.width}.png`), fullPage: true });
    }
    await expect(personal.getByText('+58 0412 1234567', { exact: true })).toBeVisible();
    await expect(personal.getByRole('button', { name: /Asignar|Guardar estado|Rechazar/ })).toHaveCount(0);
    expect((await contexts[3].request.get(`${base}/personal/orders/${order.id}`)).status()).toBe(404);
    const file = await contexts[2].request.get(`${base}/personal/orders/${order.id}/assets/${order.assets[0].id}/view`);
    expect(file.status()).toBe(200); const link = await file.json();
    expect((await contexts[2].request.get(link.signed_url)).status()).toBe(200);
    // Mutate on a different HTTP process; both streams still learn the committed revision.
    const reassigned = await contexts[0].request.patch(`http://127.0.0.1:3003${base}/orders/${order.id}/assignment`, {
      headers: await headers(contexts[0]), data: { assigned_personal_membership_id: second, expected_version: assignedOrder.version } });
    expect(reassigned.status()).toBe(200); const next = await reassigned.json();
    await expect(personal.getByText(description, { exact: true })).toHaveCount(0, { timeout: 2000 });
    await expect(other.getByText(description, { exact: true })).toBeVisible({ timeout: 2000 });
    const reassignLatency = Date.now() - Date.parse(next.updated_at); expect(reassignLatency).toBeLessThan(2000);
    expect((await contexts[2].request.get(`${base}/personal/orders/${order.id}/assets/${order.assets[0].id}/view`)).status()).toBe(404);
    await card.getByRole('button', { name: 'Rechazar solicitud' }).click();
    const rejected = manager.waitForResponse(response => response.url().endsWith('/reject'));
    await manager.getByRole('dialog').getByRole('button', { name: 'Confirmar rechazo' }).click();
    const rejection = await rejected; expect(rejection.status()).toBe(200); const rejectedOrder = await rejection.json();
    await expect(other.getByText(description, { exact: true })).toHaveCount(0, { timeout: 2000 });
    await expect(tenant.locator('article').filter({ hasText: description }).getByText('Rechazada', { exact: true })).toBeVisible({ timeout: 2000 });
    const rejectLatency = Date.now() - Date.parse(rejectedOrder.updated_at); expect(rejectLatency).toBeLessThan(2000);
    await contexts[1].setOffline(true);
    const reopened = await contexts[0].request.patch(`${base}/orders/${order.id}/status`, { headers: await headers(contexts[0]), data: { status: 'open', expected_version: rejectedOrder.version } });
    expect(reopened.status()).toBe(200);
    await contexts[1].setOffline(false); await tenant.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(tenant.locator('article').filter({ hasText: description }).getByText('Sin procesar', { exact: true })).toBeVisible();
    const reopenedOrder = await reopened.json();
    const reassignment = await contexts[0].request.patch(`${base}/orders/${order.id}/assignment`, { headers: await headers(contexts[0]), data: { assigned_personal_membership_id: person, expected_version: reopenedOrder.version } });
    expect(reassignment.status()).toBe(200); const currentOrder = await reassignment.json();
    await expect(personal.getByText(description, { exact: true })).toBeVisible();
    const closed = await contexts[0].request.patch(`${base}/orders/${order.id}/status`, { headers: await headers(contexts[0]), data: { status: 'solved', expected_version: currentOrder.version } });
    expect(closed.status()).toBe(200); const closedOrder = await closed.json();
    await expect(personal.getByText(description, { exact: true })).toHaveCount(0, { timeout: 2000 });
    await expect(tenant.locator('article').filter({ hasText: description }).getByText('Solucionado', { exact: true })).toBeVisible({ timeout: 2000 });
    const closeLatency = Date.now() - Date.parse(closedOrder.updated_at); expect(closeLatency).toBeLessThan(2000);
    console.log('SPEC45 commit-to-visible milliseconds', JSON.stringify({ assign: assignLatency, reassign: reassignLatency, reject: rejectLatency, close: closeLatency }));
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await manager.setViewportSize(viewport); expect(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await manager.screenshot({ path: info.outputPath(`manager-${viewport.width}.png`), fullPage: true });
    }
    await info.attach('latency', { body: JSON.stringify({ assign_commit_to_visible_ms: assignLatency }), contentType: 'application/json' });
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
test('SPEC45 revocation removes an assigned order from a loaded second page', async ({ page, browser }) => {
  test.skip(!database, 'Requires disposable SPEC45 fixtures'); test.setTimeout(60_000);
  const ids: string[] = [];
  for (let i = 0; i < 27; i++) {
    const draft = JSON.parse(sql(`select public.spec43_arrangements('${org}','${tenantId}','tenant.draft',${q(JSON.stringify({ description: `SPEC45 pagination ${i}`, idempotency_key: `pagination-${Date.now()}-${i}` }))},'browser')`));
    const order = JSON.parse(sql(`select public.spec43_arrangements('${org}','${tenantId}','tenant.submit','{"order_id":"${draft.id}"}','browser')`));
    sql(rpc('internal.assign', { order_id: order.id, expected_version: order.version, assigned_personal_membership_id: person })); ids.push(order.id);
  }
  await login(page, 'personal@example.test'); await page.goto('/t/azar/personal');
  await page.getByRole('button', { name: 'Cargar más', exact: true }).click(); await expect(page.locator('article')).toHaveCount(27);
  const target = page.locator('article').last(); const id = await target.locator('p.font-mono').last().textContent();
  expect(ids).toContain(id);
  const old = JSON.parse(sql(rpc('internal.detail', { order_id: id })));
  sql(rpc('internal.unassign', { order_id: id, expected_version: old.version }));
  await expect(page.getByText(id!, { exact: true })).toHaveCount(0, { timeout: 2000 });
  expect((await page.context().request.get(`${base}/personal/orders/${id}`)).status()).toBe(404);
  const foreign = await browser.newContext();
  try { const other = await foreign.newPage(); await login(other, 'personal-b@example.test'); expect((await foreign.request.get(`${base}/personal/orders/${ids[0]}`)).status()).toBe(404); }
  finally { await foreign.close(); }
});
for (const mode of ['new', 'existing', 'google'] as const) test(`SPEC45 phone onboarding for ${mode} account persists with invitation`, async ({ page, browser }, info) => {
  test.skip(!database, 'Requires disposable SPEC45 API'); test.setTimeout(60_000);
  await login(page, 'owner@example.test');
  const property = sql(`select arrangement_property_id from public.organization_memberships where id='${tenantId}'`);
  const email = mode === 'new' ? `tenant-new-${Date.now()}@example.test` : mode === 'google' ? 'other@example.test' : 'existing-personal@example.test';
  const invitation = await page.context().request.post(`${base}/properties/${property}/invitations`, {
    headers: { ...await headers(page.context()), 'Idempotency-Key': `phone-${mode}-${Date.now()}` }, data: { email } });
  expect(invitation.status()).toBe(201); const receipt = await invitation.json();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const invited = await context.newPage(); await invited.goto(receipt.share_url);
    if (mode === 'new') {
      await invited.getByLabel('Nombre', { exact: false }).fill('Nuevo inquilino');
      await invited.getByLabel('Contraseña', { exact: false }).first().fill('spec45-new-password');
      await invited.getByLabel('Confirmar contraseña').fill('spec45-new-password');
      await invited.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
    } else if (mode === 'google') {
      // Controlled provider boundary; real Google-session endpoint, app session and acceptance persistence.
      const google = await context.request.post('/api/auth/google/session', { headers: { Origin: 'http://127.0.0.1:4173' }, data: { access_token: `spec45-google:${email}` } });
      expect(google.status()).toBe(200); await invited.reload();
    } else {
      await invited.getByRole('tab', { name: 'Iniciar sesión' }).click();
      await invited.getByLabel('Correo electrónico').fill(email);
      await invited.getByLabel('Contraseña', { exact: false }).fill('spec45-test-password');
      await invited.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    }
    const phone = invited.getByLabel('Número de teléfono', { exact: false }); await expect(phone).toBeVisible();
    await invited.getByRole('button', { name: 'Aceptar invitación', exact: true }).click();
    await expect(invited.getByText(/Ingresá un teléfono/)).toBeVisible();
    expect(sql(`select status from public.organization_invitations where id=${q(receipt.invitation_id)}`)).toBe('pending');
    await phone.fill(' +58 (0412) 555-0123 ');
    const accepted = invited.waitForResponse(response => response.url().endsWith('/invitations/accept'));
    await invited.getByRole('button', { name: 'Aceptar invitación', exact: true }).click();
    expect((await accepted).status()).toBe(200); await expect(invited).toHaveURL('/t/azar/inquilino');
    expect(sql(`select inquilino_contact_number from public.organization_memberships m join auth.users u on u.id=m.user_id where u.email=${q(email)} and organization_id='${org}'`)).toBe('+58 (0412) 555-0123');
    await expect(invited.getByRole('button', { name: 'Solicitud de arreglo', exact: true })).toBeVisible();
    await expect(invited.getByLabel(/Número de teléfono/)).toHaveCount(0);
    expect(await invited.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await invited.screenshot({ path: info.outputPath(`tenant-${mode}.png`), fullPage: true });
  } finally { await context.close(); }
});
