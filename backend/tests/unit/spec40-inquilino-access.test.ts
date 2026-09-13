import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { arrangementHarness, A, B, USER, environment } from '../fixtures/arrangements.js';
import { ROLE_CAPABILITIES, hasOrganizationCapability, allowedInvitationRoles } from '../../src/organizations/roleCapabilities.js';
import { MembershipService, type MembershipMutationRepository } from '../../src/organizations/membershipService.js';
import { OrganizationService } from '../../src/organizations/organizationService.js';
import { OrganizationSettingsService } from '../../src/organizations/organizationSettingsService.js';
import { OrganizationDomainError } from '../../src/organizations/errors.js';
import { createOrganizationContextRouter } from '../../src/routes/identity.js';
import { createTenantContractEntriesRouter } from '../../src/routes/tenantContractEntries.js';
import { createTenantPropertyCompatibilityRouter } from '../../src/routes/properties.js';
import { createOrganizationGovernanceRouter, type OrganizationRouteServices } from '../../src/routes/organizationGovernance.js';
import { createOrganizationRouteContextResolver } from '../../src/identity/organizationContextResolver.js';
import { InvitationWorkflowService } from '../../src/organizations/invitationWorkflow.js';
import { CaptureInvitationDeliveryAdapter, renderInvitationEmail } from '../../src/organizations/invitationDelivery.js';
import type { OrganizationRole, OrganizationActorContext } from '../../src/organizations/types.js';

const config = { enabled: true, delivery_method: 'share_link' as const, adapter: 'capture' as const,
  public_base_url: 'https://app.example.test', template_version: 'v1', provider_reference_pepper: 'p'.repeat(48), webhook_secret: '' };
const forbidden = (error: unknown) => error instanceof OrganizationDomainError && error.code === 'FORBIDDEN';

test('SPEC-40 grants only tenant capabilities and no internal inheritance', () => {
  assert.deepEqual([...ROLE_CAPABILITIES.inquilino], ['inquilino.home.read', 'inquilino.arrangements.read', 'inquilino.arrangements.create']);
  for (const capability of ROLE_CAPABILITIES.owner) {
    assert.equal(hasOrganizationCapability('inquilino', 'active', 'active', capability), false, capability);
  }
  for (const status of ['suspended', 'removed'] as const) {
    assert.equal(hasOrganizationCapability('inquilino', status, 'active', 'inquilino.home.read'), false);
  }
  for (const status of ['suspended', 'pending_deletion', 'deleted'] as const) {
    assert.equal(hasOrganizationCapability('inquilino', 'active', status, 'inquilino.home.read'), false);
  }
  for (const role of ['owner', 'admin', 'member', 'viewer'] as const) assert.equal(ROLE_CAPABILITIES[role].has('inquilino.home.read'), false);
  assert.equal(hasOrganizationCapability('inquilino', 'active', 'active', 'inquilino.home.read'), true);
  assert.deepEqual(allowedInvitationRoles('inquilino'), []);
});

test('SPEC-40 context projects only home authority and revalidates membership lifecycle', async () => {
  const { app, cookie, sessions, identity, state } = arrangementHarness();
  app.use('/api', createOrganizationContextRouter(sessions, identity, environment));
  state.membership = { ...state.membership, role: 'inquilino' };
  const result = await request(app).get('/api/organizations/azar/context').set('Cookie', cookie).expect(200);
  assert.equal(result.body.home_destination, 'inquilino');
  assert.deepEqual(result.body.capabilities, ['inquilino.home.read', 'inquilino.arrangements.read', 'inquilino.arrangements.create']);
  assert.deepEqual(Object.keys(result.body.organization).sort(), ['display_name', 'id', 'slug', 'status']);
  assert.deepEqual(Object.keys(result.body.membership).sort(), ['arrangement_property_id', 'id', 'organization_id', 'role', 'status', 'user_id', 'version']);
  assert.equal(result.headers['cache-control'], 'no-store');
  await request(app).get(`/api/organizations/${B}/context`).set('Cookie', cookie).expect(404);
  for (const status of ['suspended', 'removed'] as const) {
    state.membership = { ...state.membership, status };
    await request(app).get('/api/organizations/azar/context').set('Cookie', cookie).expect(404);
  }
  state.membership = { ...state.membership, status: 'active' };
  state.organization = { ...state.organization, status: 'suspended' };
  const suspended = await request(app).get('/api/organizations/azar/context').set('Cookie', cookie).expect(200);
  assert.equal(suspended.body.home_destination, null);
  assert.deepEqual(suspended.body.capabilities, []);
});

test('SPEC-40 rejects actual internal HTTP routes before product reads or mutations', async () => {
  const { app, cookie, sessions, identity, material, state } = arrangementHarness();
  state.membership = { ...state.membership, role: 'inquilino' };
  let dependencyCalls = 0;
  const noAccess = new Proxy({}, { get() { return () => { dependencyCalls++; throw new Error('Protected dependency reached'); }; } });
  const env = { ...environment, APP_ALLOWED_ORIGINS: config.public_base_url };
  app.use(express.json());
  app.use('/api', createOrganizationContextRouter(sessions, identity, env));
  app.use('/api/organizations/:organization/contracts', createTenantContractEntriesRouter(sessions, noAccess as never, env));
  app.use('/api/organizations/:organization/properties/legacy', createTenantPropertyCompatibilityRouter(sessions, env));
  app.use('/api', createOrganizationGovernanceRouter(createOrganizationRouteContextResolver(sessions), {
    organizations: new OrganizationService(noAccess as never),
    memberships: new MembershipService(noAccess as never),
    settings: new OrganizationSettingsService(noAccess as never),
    invitations: new InvitationWorkflowService(noAccess as never, new CaptureInvitationDeliveryAdapter(), config),
    sessions, environment: env, identityProvider: noAccess,
  } as OrganizationRouteServices, config.public_base_url));
  for (const path of ['arrangements/orders', 'contracts/admin/entries', 'members', 'invitations', 'settings', 'api-keys']) {
    await request(app).get(`/api/organizations/${A}/${path}`).set('Cookie', cookie).expect(403);
  }
  for (const path of ['contracts/create', 'properties/legacy/submit', 'properties/legacy/media/presign', 'invitations']) {
    await request(app).post(`/api/organizations/${A}/${path}`)
      .set('Cookie', `${cookie}; form_site_csrf=${material.csrf_token}`)
      .set('X-CSRF-Token', material.csrf_token).set('Origin', config.public_base_url)
      .send({ email: 'new@example.test', intended_role: 'inquilino' }).expect(403);
  }
  assert.equal(dependencyCalls, 0);
  assert.deepEqual(state.reads, []);
});

test('SPEC-40 owner/admin changes remain scoped, versioned, and reject self-assignment and admin escalation', async () => {
  const { state } = arrangementHarness();
  let written = 0;
  const target = { ...state.membership, arrangement_property_id: '60000000-0000-4000-8000-000000000001', id: '30000000-0000-4000-8000-000000000009', user_id: 'target', role: 'member' as OrganizationRole };
  const repository: MembershipMutationRepository = {
    async getMembership(org, user) { assert.equal(org, A); return user === USER ? state.membership : target; },
    async changeRoleAtomic(input) { written++; assert.equal(input.organization_id, A); assert.equal(input.expected_version, 1); return { ...target, role: input.next_role }; },
    async listActiveOwnersForUpdate() { return []; },
    async changeStatusAtomic() { throw new Error('unused'); }, async transferOwnershipAtomic() { throw new Error('unused'); },
  };
  const service = new MembershipService(repository);
  const actor = (role: OrganizationRole): OrganizationActorContext => ({ request_id: 'spec40-role-change', user_id: USER,
    display_name: 'Actor', organization: state.organization, membership: { ...state.membership, role } });
  for (const role of ['owner', 'admin'] as const) {
    assert.equal((await service.changeRole('target', 'inquilino', 1, actor(role))).role, 'inquilino');
  }
  target.role = 'inquilino';
  await assert.rejects(service.changeRole('target', 'admin', 1, actor('admin')), forbidden);
  await assert.rejects(service.changeRole(USER, 'inquilino', 1, actor('owner')), forbidden);
  for (const role of ['member', 'viewer', 'inquilino'] as const) {
    await assert.rejects(service.changeRole('target', 'inquilino', 1, actor(role)), forbidden);
  }
  target.role = 'owner';
  await assert.rejects(service.changeRole('target', 'inquilino', 1, actor('admin')), forbidden);
  await assert.rejects(service.changeRole('target', 'inquilino', 1, actor('owner')), (error: unknown) =>
    error instanceof OrganizationDomainError && error.code === 'LAST_OWNER_REQUIRED');
  assert.equal(written, 2);
});

test('SPEC-40 invitation email names the new role', () => {
  const output = renderInvitationEmail({ attempt_id: 'test', idempotency_key: 'spec40-invite', recipient: 'invited@example.test',
    organization_display_name: 'Azar', inviter_display_name: 'Owner', intended_role: 'inquilino',
    expires_at: '2099-01-01T00:00:00Z', acceptance_url: 'https://app.example.test/invitations/accept#invitation_token=test', locale: 'es', template_version: 'v1' });
  assert.match(output.text, /como inquilino/u);
});

test('SPEC-40 invitation registration fails before activation without a valid handoff', async () => {
  let activated = 0;
  const app = express(); app.use(express.json());
  app.use('/api', createOrganizationGovernanceRouter({} as never, {
    environment: {}, invitations: { async registrationContext() { return null; } },
    identityProvider: { async activateInvitationUser() { activated++; } },
  } as unknown as OrganizationRouteServices, config.public_base_url));
  for (const cookie of ['', 'form_site_invitation_handoff=invalid-handle.invalid-binding']) {
    await request(app).post('/api/invitations/register').set('Origin', config.public_base_url).set('Cookie', cookie)
      .send({ display_name: 'Inquilino', password: 'test-password-123' }).expect(410);
  }
  assert.equal(activated, 0);
});
