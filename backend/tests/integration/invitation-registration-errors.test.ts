import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createOrganizationGovernanceRouter, type OrganizationRouteServices, type OrganizationRouteContextResolver } from '../../src/routes/organizationGovernance.js';
import { InvitationActivationError } from '../../src/identity/supabaseIdentityProvider.js';
import { OrganizationDomainError } from '../../src/organizations/errors.js';

for (const scenario of [
  { error: new InvitationActivationError('PASSWORD_POLICY_REJECTED', 'weak_password'), status: 422, code: 'PASSWORD_POLICY_REJECTED' },
  { error: new InvitationActivationError('ACCOUNT_ALREADY_ACTIVATED'), status: 409, code: 'ACCOUNT_ALREADY_ACTIVATED' },
  { error: new Error('private-provider-response'), status: 503, code: 'AUTH_DEPENDENCY_UNAVAILABLE' },
  { error: new OrganizationDomainError('INVITATION_INVALID'), status: 410, code: 'INVITATION_INVALID' },
]) {
  test(`invitation registration reports ${scenario.code} safely`, async (t) => {
    const logs: unknown[][] = [];
    t.mock.method(console, 'warn', (...args: unknown[]) => { logs.push(args); });
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => { res.locals.request_id = 'test-invitation-error'; next(); });
    const services = {
      environment: {},
      invitations: { registrationContext: async () => ({ registration_permitted: true,
        auth_user_id: 'test-user', email_normalized: 'private@example.test' }) },
      identityProvider: { activateInvitationUser: async () => { throw scenario.error; } },
    } as unknown as OrganizationRouteServices;
    app.use('/api', createOrganizationGovernanceRouter({} as OrganizationRouteContextResolver, services, 'http://localhost:5173'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/invitations/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173',
        Cookie: 'form_site_invitation_handoff=private-handle.private-binding' },
      body: JSON.stringify({ display_name: 'Example Name', password: 'private-password-example' }),
    });
    assert.equal(response.status, scenario.status);
    const body = await response.json();
    assert.equal(body.error, scenario.code);
    const evidence = JSON.stringify({ body, logs });
    for (const secret of ['private@example.test', 'private-password-example', 'private-provider-response', 'private-handle']) {
      assert.ok(!evidence.includes(secret));
    }
    assert.match(evidence, /activate_account/);
  });
}
