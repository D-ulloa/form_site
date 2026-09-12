/** Local verification only: real repositories/RPCs and sessions, controlled identity provider. Never deploy. */
import express from 'express';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createIdentityRepository } from '../../src/identity/identityRepository.js';
import { SessionService } from '../../src/identity/sessionService.js';
import { createIdentityRouter, createOrganizationContextRouter, createTenantMutationSecurity } from '../../src/routes/identity.js';
import { createOrganizationGovernanceRouter } from '../../src/routes/organizationGovernance.js';
import { createOrganizationRouteContextResolver } from '../../src/identity/organizationContextResolver.js';
import { createOrganizationGovernanceRepository, createMembershipMutationRepository, createOrganizationSettingsRepository } from '../../src/organizations/organizationRepository.js';
import { OrganizationService } from '../../src/organizations/organizationService.js';
import { MembershipService } from '../../src/organizations/membershipService.js';
import { OrganizationSettingsService } from '../../src/organizations/organizationSettingsService.js';
import { InvitationWorkflowService, createInvitationWorkflowRepository } from '../../src/organizations/invitationWorkflow.js';
import { CaptureInvitationDeliveryAdapter } from '../../src/organizations/invitationDelivery.js';
import type { IdentityProvisioningService } from '../../src/identity/identityProvisioningService.js';
import type { IdentityProvider } from '../../src/identity/supabaseIdentityProvider.js';
import { requestIdMiddleware } from '../../src/platform/requestId.js';

const endpoint = new URL(process.env.SPEC40_POSTGREST_URL ?? 'http://127.0.0.1:55442');
if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw new Error('Disposable loopback database required');
const secret = process.env.SPEC40_TEST_JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('SPEC40_TEST_JWT_SECRET required');
const origin = 'http://127.0.0.1:4173';
const environment = { NODE_ENV: 'test', APP_SESSION_PEPPER: 's'.repeat(48), APP_CSRF_PEPPER: 'c'.repeat(48), APP_ALLOWED_ORIGINS: origin };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 7200 })}`;
const token = `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
const client = createClient(endpoint.origin, token, { auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(String(input).replace('/rest/v1/', '/'), init) } });
const owner = { id: '10000000-0000-4000-8000-000000000001', email: 'owner@example.test', display_name: 'Owner' };
const invited = { id: '10000000-0000-4000-8000-000000000005', email: 'inquilino@example.test', display_name: 'Inquilino' };
let invitedPassword: string | null = null;
// Auth is controlled in this harness. Session storage, membership lookup and governance use production repositories.
const identity = { ...createIdentityRepository(environment, client), async getUser(id: string) {
  return id === owner.id ? owner : id === invited.id ? invited : null;
} };
const sessions = new SessionService(identity, environment);
const provider = {
  async password(email: string, password: string) {
    const user = email === owner.email && password === 'owner-test-password' ? owner
      : email === invited.email && password === invitedPassword ? invited : null;
    if (!user) throw new Error('INVALID_CREDENTIALS');
    return { user_id: user.id, email: user.email, display_name: user.display_name, auth_method: 'password', assurance_level: 'aal1' };
  },
  async activateInvitationUser(id: string, email: string, password: string) {
    if (id !== invited.id || email !== invited.email) throw new Error('INVALID_CREDENTIALS');
    invitedPassword = password;
  },
  async accessToken() { throw new Error('INVALID_CREDENTIALS'); },
} as IdentityProvider;
const invitations = new InvitationWorkflowService(createInvitationWorkflowRepository(environment, client),
  new CaptureInvitationDeliveryAdapter(), { enabled: true, delivery_method: 'share_link', adapter: 'capture', public_base_url: origin,
    template_version: 'v1', provider_reference_pepper: 'p'.repeat(48), webhook_secret: '' });
const provisioning = { async provision(input: { email: string }) {
  if (input.email !== invited.email) throw new Error('Use the disposable invitation fixture');
  return { user_id: invited.id, activation_required: true, outcome: 'created_activation_required' };
} } as unknown as IdentityProvisioningService;
const services = {
  organizations: new OrganizationService(createOrganizationGovernanceRepository(environment, client), undefined, invitations, provisioning),
  memberships: new MembershipService(createMembershipMutationRepository(environment, client)),
  settings: new OrganizationSettingsService(createOrganizationSettingsRepository(environment, client)),
  invitations, sessions, identityProvider: provider, environment,
};
const app = express(); app.use(express.json()); app.use(requestIdMiddleware);
app.use('/api/auth', createIdentityRouter(sessions, provider, environment));
app.use('/api', createOrganizationContextRouter(sessions, identity, environment));
app.use('/api', createTenantMutationSecurity(sessions, environment),
  createOrganizationGovernanceRouter(createOrganizationRouteContextResolver(sessions), services, origin));
app.listen(3001, '127.0.0.1', () => process.stdout.write('SPEC-40 local API on 127.0.0.1:3001\n'));
