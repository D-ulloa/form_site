import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { createTenantPropertyCompatibilityRouter } from '../../src/routes/properties.js';
import type { SessionService } from '../../src/identity/sessionService.js';
import { hashCsrfToken } from '../../src/identity/sessionSecurity.js';

test('unconfigured production organization cannot invoke global property destinations even in development mode', async () => {
  const environment = { NODE_ENV: 'development', VERCEL_ENV: 'production', APP_CSRF_PEPPER: 'a'.repeat(32) };
  const sessions = {
    async authenticate() { return { identity: { id: 'user' }, session: { csrf_token_hash: hashCsrfToken('csrf', environment) } }; },
    async context() { return { user_id: 'user', organization: { id: 'new-organization' } }; },
  } as unknown as SessionService;
  const app = express();
  app.use('/api/organizations/:organization/properties/legacy', createTenantPropertyCompatibilityRouter(sessions, environment));
  const response = await request(app).post('/api/organizations/new/properties/legacy/submit')
    .set('Cookie', 'form_site_csrf=csrf').set('X-CSRF-Token', 'csrf').expect(503);
  assert.equal(response.body.error, 'PROPERTY_INTEGRATION_NOT_CONFIGURED');
});
