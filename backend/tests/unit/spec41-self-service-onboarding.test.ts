import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { SelfServiceOnboardingService } from '../../src/onboarding/selfServiceOnboardingService.js';
import type { SelfServiceOnboardingRepository } from '../../src/onboarding/selfServiceOnboardingRepository.js';
import { SelfServiceOnboardingError, type SelfServiceOnboardingOperation } from '../../src/onboarding/selfServiceOnboardingTypes.js';
import type { SelfServiceIdentityAdminAdapter } from '../../src/identity/supabaseAdminAdapter.js';

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const environment = {
  SELF_SERVICE_REGISTRATION_ENABLED: 'true', SELF_SERVICE_ONBOARDING_EMAIL_PEPPER: 'p'.repeat(48),
  SELF_SERVICE_ONBOARDING_DEFAULT_LOCALE: 'es', SELF_SERVICE_ONBOARDING_DEFAULT_TIME_ZONE: 'America/Caracas',
  SELF_SERVICE_TERMS_VERSION: 'v1',
} as NodeJS.ProcessEnv;

function operation(overrides: Partial<SelfServiceOnboardingOperation> = {}): SelfServiceOnboardingOperation {
  return {
    operation_id: OPERATION_ID, claim_state: 'created', state: 'started', auth_user_id: null,
    organization_id: '33333333-3333-4333-8333-333333333333', organization_slug: 'horizonte-11111111',
    owner_membership_id: '44444444-4444-4444-8444-444444444444', failure_code: null, ...overrides,
  };
}

class FakeRepository implements SelfServiceOnboardingRepository {
  current = operation();
  rejected = 0;
  async claim() { return this.current; }
  async markIdentity(_operationId: string, userId: string) {
    this.current = operation({ claim_state: 'resumed', state: 'identity_created', auth_user_id: userId });
    return this.current;
  }
  async reject() { this.rejected += 1; this.current = operation({ state: 'rejected', failure_code: 'EXISTING_ACCOUNT' }); }
  async complete(_operationId: string, userId: string) {
    this.current = operation({ claim_state: 'resumed', state: 'completed', auth_user_id: userId });
    return this.current;
  }
  async get(_operationId: string, userId: string) {
    if (this.current.auth_user_id !== userId) throw new SelfServiceOnboardingError('FORBIDDEN');
    return this.current;
  }
}

function identity(overrides: Partial<SelfServiceIdentityAdminAdapter> = {}): SelfServiceIdentityAdminAdapter {
  return {
    async resolveByEmail() { return []; },
    async createInviteOnly() { throw new Error('not used'); },
    async createPassword(email, _password, displayName) {
      return { user_id: USER_ID, email, display_name: displayName, auth_method: 'password', assurance_level: 'aal1' };
    },
    async sessionIdentity(userId, method) {
      return { user_id: userId, email: 'owner@example.test', display_name: 'Owner', auth_method: method, assurance_level: 'aal1' };
    },
    ...overrides,
  };
}

function input() {
  return {
    operation_id: OPERATION_ID, full_name: 'Owner Example', email: 'owner@example.test',
    organization_name: 'Horizonte', terms_accepted: true as const, auth_method: 'password' as const,
    password: 'a-valid-password', password_confirmation: 'a-valid-password', remember_me: false,
  };
}

test('SPEC-41 creates a password identity once, marks it owner-bound, and completes the reusable operation', async () => {
  const repository = new FakeRepository();
  const result = await new SelfServiceOnboardingService(repository, identity(), environment).registerPassword(input(), 'request-spec41-001');
  assert.equal(result.identity.user_id, USER_ID);
  assert.equal(result.operation.state, 'completed');
  assert.equal(result.operation.organization_slug, 'horizonte-11111111');
  assert.equal(repository.rejected, 0);
});

test('SPEC-41 rejects an existing identity without allowing an organization bootstrap', async () => {
  const repository = new FakeRepository();
  const existing = identity({ async resolveByEmail() {
    return [{ id: USER_ID, email_normalized: 'owner@example.test', activation_required: false, eligible: true }];
  } });
  await assert.rejects(new SelfServiceOnboardingService(repository, existing, environment).registerPassword(input(), 'request-spec41-002'),
    (error: unknown) => error instanceof SelfServiceOnboardingError && error.code === 'EXISTING_ACCOUNT');
  assert.equal(repository.rejected, 1);
});

test('SPEC-41 replays a response-lost password creation by binding the same resolved identity', async () => {
  const repository = new FakeRepository();
  repository.current = operation({ claim_state: 'replayed' });
  const adapter = identity({ async resolveByEmail() {
    return [{ id: USER_ID, email_normalized: 'owner@example.test', activation_required: false, eligible: true }];
  } });
  const result = await new SelfServiceOnboardingService(repository, adapter, environment).registerPassword(input(), 'request-spec41-003');
  assert.equal(result.operation.state, 'completed');
  assert.equal(repository.rejected, 0);
});

test('SPEC-41 returns the original organization for a response-lost completed password registration', async () => {
  const repository = new FakeRepository();
  repository.current = operation({ claim_state: 'replayed', state: 'completed', auth_user_id: USER_ID });
  const adapter = identity({ async resolveByEmail() {
    return [{ id: USER_ID, email_normalized: 'owner@example.test', activation_required: false, eligible: true }];
  } });
  const result = await new SelfServiceOnboardingService(repository, adapter, environment).registerPassword(input(), 'request-spec41-004');
  assert.equal(result.identity.user_id, USER_ID);
  assert.equal(result.operation.organization_slug, 'horizonte-11111111');
  assert.equal(repository.rejected, 0);
});

test('SPEC-41 migration keeps onboarding evidence append-only, fingerprinted, service-role-only, and password-free', async () => {
  const sql = await readFile(new URL('../../../supabase/migrations/20260904120000_spec41_self_service_registration.sql', import.meta.url), 'utf8');
  assert.match(sql, /email_fingerprint text not null/u);
  assert.match(sql, /check \(organization_id is not null and owner_membership_id is not null\)/u);
  assert.match(sql, /self_service_onboarding_events_append_only/u);
  assert.match(sql, /force row level security/u);
  assert.match(sql, /revoke all on function public\.spec41_complete_self_service_onboarding/u);
  assert.match(sql, /grant execute on function public\.spec41_complete_self_service_onboarding[\s\S]*service_role/u);
  assert.doesNotMatch(sql, /password_hash|raw_email|access_token|service_role_key/u);
});
