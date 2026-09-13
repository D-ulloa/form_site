import { expect, test } from '@playwright/test';
import { organizationContext, organizationSession } from '../fixtures/organizations';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`personal exclusive home and navigation at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
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
          email: 'personal-con-un-correo-muy-largo-para-probar@example.test' } } });
      } else if (path.endsWith('/context')) {
        const context = organizationContext('azar');
        await route.fulfill({ json: { ...context, membership: { ...context.membership, role: 'personal' },
          capabilities: denied ? [] : ['personal.home.read'], home_destination: denied ? null : 'personal' } });
      } else { unexpected.push(path); await route.fulfill({ status: 500 }); }
    });
    await page.goto('/t/azar');
    await expect(page).toHaveURL('/t/azar/personal');
    await expect(page.getByRole('main')).toHaveText('Inicio');
    await expect(page.getByRole('button')).toHaveCount(1);
    await expect(page.getByRole('link')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cerrar sesión' }).focus();
    expect(await page.getByRole('button').evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('personal-home.png'), fullPage: true });
    await page.reload();
    await expect(page.getByRole('main')).toHaveText('Inicio');
    for (const path of ['arrangements', 'inquilino', 'contracts/admin', 'properties/new', 'settings/members', 'settings/invitations', 'settings/organization', 'settings/lifecycle']) {
      await page.goto(`/t/azar/${path}`);
      await expect(page).toHaveURL('/t/azar/personal');
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

