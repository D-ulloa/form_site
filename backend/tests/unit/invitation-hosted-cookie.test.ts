import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { createOrganizationGovernanceRouter, type OrganizationRouteServices, type OrganizationRouteContextResolver } from '../../src/routes/organizationGovernance.js';

test('hosted invitation handoff cookie covers the public API path', async () => {
  const app = express(); app.use(express.json());
  const services = { environment: { VERCEL: '1' }, invitations: {
    async createHandoff() { return { handle: 'handle', browser_binding: 'binding', max_age_seconds: 300 }; },
  } } as unknown as OrganizationRouteServices;
  app.use('/_/backend/api', createOrganizationGovernanceRouter({} as OrganizationRouteContextResolver, services, 'https://app.example.test'));
  const response = await request(app).post('/_/backend/api/invitations/handoff')
    .set('Origin', 'https://app.example.test').send({ invitation_token: 'token' }).expect(201);
  assert.match(String(response.headers['set-cookie']), /Path=\/_\/backend\/api\/invitations; HttpOnly; Secure/);
});
