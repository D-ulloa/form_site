import type { ArrangementRequestDependencies } from '../../src/routes/arrangementRequests.js';
import type { ArrangementPropertyDependencies } from '../../src/routes/arrangementProperties.js';
import express from 'express';
import type { IdentityRepository } from '../../src/identity/identityRepository.js';
import type { AppSessionRecord } from '../../src/identity/types.js';
import { createSessionTokenMaterial } from '../../src/identity/sessionSecurity.js';
import { SessionService } from '../../src/identity/sessionService.js';
import type { OrganizationMembershipRecord, OrganizationRecord } from '../../src/organizations/types.js';
import type { ArrangementOrderRepository } from '../../src/arrangements/types.js';
import { createListArrangementOrders } from '../../src/services/listArrangementOrders.js';
import { createArrangementsRouter } from '../../src/routes/arrangements.js';
import { createDistributedRateLimiter } from '../../src/platform/rateLimit.js';
import { requestIdMiddleware } from '../../src/platform/requestId.js';

export const A = '20000000-0000-4000-8000-000000000001';
export const B = '20000000-0000-4000-8000-000000000002';
export const USER = '10000000-0000-4000-8000-000000000001';
export const ORDER = '50000000-0000-4000-8000-000000000001';
export const environment: NodeJS.ProcessEnv = {
  NODE_ENV: 'test', APP_ALLOWED_ORIGINS: 'https://app.example.test', APP_SESSION_PEPPER: 's'.repeat(48), APP_CSRF_PEPPER: 'c'.repeat(48),
  PLATFORM_CURSOR_SECRET: 'p'.repeat(48), PLATFORM_RATE_LIMIT_PEPPER: 'l'.repeat(48),
};

export function arrangementHarness(repository?: ArrangementOrderRepository, dependencies: ArrangementPropertyDependencies & ArrangementRequestDependencies = {}) {
  const now = new Date().toISOString();
  const material = createSessionTokenMaterial(environment);
  const state = {
    session: {
      id: '40000000-0000-4000-8000-000000000001', user_id: USER,
      token_prefix: material.token_prefix, token_hash: material.token_hash, hash_version: 1,
      csrf_token_hash: material.csrf_token_hash, auth_method: 'password', assurance_level: 'aal1',
      created_at: now, authenticated_at: now, absolute_expires_at: '2099-01-01T00:00:00Z',
      idle_expires_at: null, remembered: false, last_seen_at: now, revoked_at: null,
      rotated_from_session_id: null, version: 1,
    } as AppSessionRecord,
    membership: { id: '30000000-0000-4000-8000-000000000001', organization_id: A, user_id: USER,
      role: 'owner', status: 'active', joined_at: now, version: 1 } as OrganizationMembershipRecord,
    organization: { id: A, slug: 'azar', display_name: 'Azar', legal_name: null, status: 'active',
      plan_key: 'internal', locale: 'es-VE', time_zone: 'America/Caracas', creation_source: 'migration',
      created_by_user_id: USER, status_reason_code: null, status_changed_at: now,
      created_at: now, updated_at: now, deleted_at: null, version: 1 } as OrganizationRecord,
    limiterCalls: 0, reads: [] as Array<{ organization_id: string; status: string | null }>,
    allowed: true, limiterUnavailable: false,
  };
  const identity = {
    async findSession(prefix: string, hash: string) {
      return prefix === material.token_prefix && hash === material.token_hash ? state.session : null;
    },
    async getUser(id: string) { return id === USER ? { id: USER, email: 'member@example.test', display_name: 'Member' } : null; },
    async getMembership(id: string, organization: string) {
      return id === USER && [state.organization.id, state.organization.slug].includes(organization)
        ? { membership: state.membership, organization: state.organization } : null;
    },
    async touchSession() { return state.session; },
  } as IdentityRepository;
  const sessions = new SessionService(identity, environment);
  const orders: ArrangementOrderRepository = repository ?? {
    async listOpen(scope, query) {
      state.reads.push({ organization_id: scope.organization_id, status: query.status });
      return { organization_id: scope.organization_id,
        items: query.status && query.status !== 'open' ? [] : [{ id: ORDER, organization_id: scope.organization_id, name: 'Ventana', status: 'open' }],
        available_statuses: ['open'], next_after_id: null };
    },
  };
  const limiter = createDistributedRateLimiter({ async consume(input) {
    state.limiterCalls += 1;
    if (state.limiterUnavailable) throw new Error('private limiter error');
    return { allowed: state.allowed, remaining: 0, retry_after_seconds: 60, policy_key: input.policy_key };
  } }, environment.PLATFORM_RATE_LIMIT_PEPPER!);
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use('/api/organizations/:organization/arrangements', createArrangementsRouter(sessions, environment, {
    ...dependencies, ...(dependencies.requests ? {} : { list: createListArrangementOrders(orders, environment) }), limiter,
  }));
  return { app, state, sessions, identity, material, cookie: `form_site_session=${material.raw_token}` };
}
