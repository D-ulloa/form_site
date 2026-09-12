import { createArrangementsRouter } from '../../src/routes/arrangements.js';
import { createArrangementOrderRepository } from '../../src/arrangements/arrangementOrderRepository.js';
import { createListArrangementOrders } from '../../src/services/listArrangementOrders.js';
import { createArrangementPropertyRepository } from '../../src/arrangements/arrangementPropertyRepository.js';
import { createArrangementPropertiesService } from '../../src/services/arrangementProperties.js';
import { createDistributedRateLimiter } from '../../src/platform/rateLimit.js';
import { createPlatformRepository } from '../../src/platform/platformRepository.js';
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

const endpoint = new URL(process.env.SPEC42_POSTGREST_URL ?? 'http://127.0.0.1:55444');
if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw new Error('Disposable loopback database required');
const secret = process.env.SPEC42_TEST_JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('SPEC42_TEST_JWT_SECRET required');
const origin = 'http://127.0.0.1:4173';
const environment = { NODE_ENV: 'test', APP_SESSION_PEPPER: 's'.repeat(48), APP_CSRF_PEPPER: 'c'.repeat(48), APP_ALLOWED_ORIGINS: origin, PLATFORM_CURSOR_SECRET: 'q'.repeat(48), PLATFORM_RATE_LIMIT_PEPPER: 'r'.repeat(48) };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 7200 })}`;
const token = `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
const client = createClient(endpoint.origin, token, { auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(String(input).replace('/rest/v1/', '/'), init) } });
const names = ['owner', 'admin', 'other', 'solar-owner', 'inquilino', 'second', 'legacy', 'existing', 'reader', 'viewer', 'legacy-invite'];
const users = names.map((name, index) => ({ id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  email: `${name}@example.test`, display_name: name }));
const passwords = new Map(users.filter((_, i) => ![4, 5, 10].includes(i)).map(user => [user.id,
  user.email === 'owner@example.test' ? 'owner-test-password' : 'existing-test-password']));
// Only provider effects are controlled; sessions, limits and all domain persistence use production repositories.
const identity = { ...createIdentityRepository(environment, client), async getUser(id: string) {
  return users.find(user => user.id === id) ?? null;
} };
const sessions = new SessionService(identity, environment);
const provider = {
  async password(email: string, password: string) {
    const user = users.find(candidate => candidate.email === email && passwords.get(candidate.id) === password);
    if (!user) throw new Error('INVALID_CREDENTIALS');
    return { user_id: user.id, email: user.email, display_name: user.display_name, auth_method: 'password', assurance_level: 'aal1' };
  },
  async activateInvitationUser(id: string, email: string, password: string, displayName: string) {
    const user = users.find(candidate => candidate.id === id && candidate.email === email);
    if (!user || passwords.has(id)) throw new Error('INVALID_CREDENTIALS');
    passwords.set(id, password); user.display_name = displayName;
  },
  async accessToken() { throw new Error('INVALID_CREDENTIALS'); },
} as IdentityProvider;
const invitations = new InvitationWorkflowService(createInvitationWorkflowRepository(environment, client),
  new CaptureInvitationDeliveryAdapter(), { enabled: true, delivery_method: 'share_link', adapter: 'capture', public_base_url: origin,
    template_version: 'v1', provider_reference_pepper: 'p'.repeat(48), webhook_secret: '' });
const provisioning = { async provision(input: { email: string }) {
  const user = users.find(candidate => candidate.email === input.email);
  if (!user) throw new Error('Use disposable fixture identities');
  return { user_id: user.id, activation_required: !passwords.has(user.id),
    outcome: passwords.has(user.id) ? 'existing_profile_present' : 'created_activation_required' };
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
const limiter = createDistributedRateLimiter(createPlatformRepository(client, environment), environment.PLATFORM_RATE_LIMIT_PEPPER);
app.use('/api/organizations/:organization/arrangements', createArrangementsRouter(sessions, environment, {
  list: createListArrangementOrders(createArrangementOrderRepository(client, environment), environment),
  properties: createArrangementPropertiesService(createArrangementPropertyRepository(client, environment), environment),
  organizations: services.organizations, limiter,
}));
app.use('/api', createTenantMutationSecurity(sessions, environment),
  createOrganizationGovernanceRouter(createOrganizationRouteContextResolver(sessions), services, origin, limiter));
app.listen(3002, '127.0.0.1', () => process.stdout.write('SPEC-42 local API on 127.0.0.1:3002\n'));
