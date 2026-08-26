import assert from 'node:assert/strict';
import test from 'node:test';
import type { IdentityProvisioningRepository, ProvisioningOperationRecord } from '../../src/identity/identityProvisioningRepository.js';
import { IdentityProvisioningService } from '../../src/identity/identityProvisioningService.js';
import { createPlatformProvisioningActor, IdentityProvisioningError } from '../../src/identity/identityProvisioningTypes.js';
import type { IdentityProvisioningActor, IdentityProvisioningOutcome, IdentityProvisioningPurpose } from '../../src/identity/identityProvisioningTypes.js';
import type { IdentityAdminAdapter, ProvisioningAuthUser } from '../../src/identity/supabaseAdminAdapter.js';
import { IdentityProviderAmbiguousError } from '../../src/identity/supabaseAdminAdapter.js';
import { validateIdentityProvisioningEnvironment } from '../../src/identity/identityProvisioningConfig.js';

const USER = '10000000-0000-4000-8000-000000000001';
const environment = { IDENTITY_PROVISIONING_ENABLED: 'true',
  IDENTITY_PROVISIONING_EMAIL_PEPPER: 'p'.repeat(48) } as NodeJS.ProcessEnv;
const actor = createPlatformProvisioningActor({ actor_type: 'platform_operator', user_id: USER,
  assurance_level: 'aal2', step_up_reference: 'mfa-session-1' });

class FakeRepository implements IdentityProvisioningRepository {
  operation: ProvisioningOperationRecord = { operation_id: '20000000-0000-4000-8000-000000000001',
    claim_state: 'created', state: 'processing', outcome: null, auth_user_id: null,
    profile_state: null, activation_required: null, provider_reconciliation_reference: null,
    provider_ambiguity_phase: null };
  payloadFingerprint: string | null = null;
  readonly profiles = new Map<string, { display_name: string; locale: string; time_zone: string }>();
  assertActor(_actor: IdentityProvisioningActor, _purpose: IdentityProvisioningPurpose) { return Promise.resolve(); }
  claim(input: { payload_fingerprint: string }) {
    if (this.payloadFingerprint && this.payloadFingerprint !== input.payload_fingerprint) {
      throw new IdentityProvisioningError('IDEMPOTENCY_CONFLICT');
    }
    if (this.operation.state === 'completed' || this.operation.state === 'blocked') {
      return Promise.resolve({ ...this.operation, claim_state: 'replayed' as const });
    }
    this.payloadFingerprint = input.payload_fingerprint;
    return Promise.resolve(this.operation);
  }
  markProviderAmbiguous(_operationId: string, phase: 'resolve' | 'create') {
    this.operation = { ...this.operation, state: 'provider_ambiguous', provider_ambiguity_phase: phase };
    return Promise.resolve();
  }
  complete(input: { user_id: string; display_name: string; locale: string; time_zone: string;
    outcome: Exclude<IdentityProvisioningOutcome, 'blocked_ambiguous' | 'blocked_ineligible'>;
    activation_required: boolean; reconciliation_reference: string }) {
    const existed = this.profiles.has(input.user_id);
    if (!existed) this.profiles.set(input.user_id, { display_name: input.display_name, locale: input.locale, time_zone: input.time_zone });
    this.operation = { ...this.operation, claim_state: 'resumed', state: 'completed', outcome: input.outcome,
      auth_user_id: input.user_id, profile_state: existed ? 'existing' : 'created',
      activation_required: input.activation_required,
      provider_reconciliation_reference: input.reconciliation_reference };
    return Promise.resolve(this.operation);
  }
  block(input: { outcome: 'blocked_ambiguous' | 'blocked_ineligible'; reconciliation_reference: string }) {
    this.operation = { ...this.operation, claim_state: 'resumed', state: 'blocked', outcome: input.outcome,
      activation_required: false, provider_reconciliation_reference: input.reconciliation_reference };
    return Promise.resolve(this.operation);
  }
}

function input(overrides: Partial<{ email: string; display_name: string }> = {}) {
  return { email: '  New.User@Example.Test  ', purpose: 'organization_invitee' as const,
    request_id: 'request-spec35-001', idempotency_key: 'provision-spec35-001', ...overrides };
}

test('SPEC-35 canonicalizes email, creates a passwordless identity, and applies neutral defaults', async () => {
  const repository = new FakeRepository(); let createdEmail = '';
  const admin: IdentityAdminAdapter = { async resolveByEmail() { return []; }, async createInviteOnly(email) {
    createdEmail = email; return { id: USER, email_normalized: email, activation_required: true, eligible: true };
  } };
  const result = await new IdentityProvisioningService(repository, admin, environment).provision(input(), actor);
  assert.equal(createdEmail, 'new.user@example.test');
  assert.equal(result.outcome, 'created_activation_required');
  assert.equal(result.profile_state, 'created');
  assert.deepEqual(repository.profiles.get(USER), { display_name: 'Usuario invitado', locale: 'es', time_zone: 'America/Caracas' });
});

test('SPEC-35 reuses one exact active identity and never overwrites profile preferences on replay', async () => {
  const repository = new FakeRepository();
  repository.profiles.set(USER, { display_name: 'Chosen name', locale: 'en', time_zone: 'UTC' });
  const existing: ProvisioningAuthUser = { id: USER, email_normalized: 'new.user@example.test', activation_required: false, eligible: true };
  const admin: IdentityAdminAdapter = { async resolveByEmail() { return [existing]; }, async createInviteOnly() { throw new Error('must not create'); } };
  const service = new IdentityProvisioningService(repository, admin, environment);
  const first = await service.provision(input({ display_name: 'Operator name' }), actor);
  const replay = await service.provision(input({ display_name: 'Operator name' }), actor);
  assert.equal(first.outcome, 'existing_active'); assert.equal(first.profile_state, 'existing');
  assert.equal(replay.idempotency, 'replayed');
  assert.deepEqual(repository.profiles.get(USER), { display_name: 'Chosen name', locale: 'en', time_zone: 'UTC' });
});

test('SPEC-35 blocks duplicate or ineligible provider identities without creating a profile', async () => {
  for (const users of [
    [{ id: USER, email_normalized: 'new.user@example.test', activation_required: false, eligible: true },
      { id: `${USER.slice(0, -1)}2`, email_normalized: 'new.user@example.test', activation_required: true, eligible: true }],
    [{ id: USER, email_normalized: 'new.user@example.test', activation_required: false, eligible: false }],
  ] satisfies ProvisioningAuthUser[][]) {
    const repository = new FakeRepository();
    const service = new IdentityProvisioningService(repository, { async resolveByEmail() { return users; },
      async createInviteOnly() { throw new Error('must not create'); } }, environment);
    const result = await service.provision(input(), actor);
    assert.equal(result.outcome, users.length > 1 ? 'blocked_ambiguous' : 'blocked_ineligible');
    assert.equal(repository.profiles.size, 0);
  }
});

test('SPEC-35 reconciles an ambiguous create response before any retry', async () => {
  const repository = new FakeRepository(); let resolutions = 0;
  const service = new IdentityProvisioningService(repository, {
    async resolveByEmail() { resolutions += 1; return resolutions === 1 ? [] : [{ id: USER,
      email_normalized: 'new.user@example.test', activation_required: true, eligible: true }]; },
    async createInviteOnly() { throw new IdentityProviderAmbiguousError(); },
  }, environment);
  assert.equal((await service.provision(input(), actor)).outcome, 'reconciled_after_ambiguity');
  assert.equal(resolutions, 2);
});

test('SPEC-35 never repeats a create whose provider result remains ambiguous', async () => {
  const repository = new FakeRepository(); let creates = 0;
  const service = new IdentityProvisioningService(repository, {
    async resolveByEmail() { return []; },
    async createInviteOnly() { creates += 1; throw new IdentityProviderAmbiguousError(); },
  }, environment);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(service.provision(input(), actor),
      (error: unknown) => error instanceof IdentityProvisioningError
        && error.code === 'IDENTITY_PROVIDER_UNAVAILABLE');
  }
  assert.equal(creates, 1);
});

test('SPEC-35 replaces raw provider failures with a safe stable error', async () => {
  const repository = new FakeRepository();
  const service = new IdentityProvisioningService(repository, {
    async resolveByEmail() { throw new Error('password=secret token=https://provider.invalid/action'); },
    async createInviteOnly() { throw new Error('must not create'); },
  }, environment);
  await assert.rejects(service.provision(input(), actor), (error: unknown) => {
    assert.ok(error instanceof IdentityProvisioningError);
    assert.equal(error.code, 'IDENTITY_PROVIDER_UNAVAILABLE');
    assert.doesNotMatch(error.message, /secret|provider\.invalid/iu);
    return true;
  });
});

test('SPEC-35 rejects an idempotency key reused with a different canonical payload', async () => {
  const repository = new FakeRepository();
  const service = new IdentityProvisioningService(repository, { async resolveByEmail() { return []; },
    async createInviteOnly(email) { return { id: USER, email_normalized: email, activation_required: true, eligible: true }; } }, environment);
  await service.provision(input(), actor);
  repository.operation = { ...repository.operation, state: 'processing', outcome: null };
  await assert.rejects(service.provision(input({ display_name: 'Different' }), actor),
    (error: unknown) => error instanceof IdentityProvisioningError && error.code === 'IDEMPOTENCY_CONFLICT');
});

test('SPEC-35 production startup requires explicit defaults, pepper, flag, and allowed activation origin', () => {
  assert.throws(() => validateIdentityProvisioningEnvironment({ NODE_ENV: 'production' }),
    /IDENTITY_PROVISIONING_DEFAULT_DISPLAY_NAME/u);
  assert.doesNotThrow(() => validateIdentityProvisioningEnvironment({ NODE_ENV: 'production',
    IDENTITY_PROVISIONING_ENABLED: 'false', IDENTITY_PROVISIONING_DEFAULT_DISPLAY_NAME: 'Usuario invitado',
    IDENTITY_PROVISIONING_DEFAULT_LOCALE: 'es', IDENTITY_PROVISIONING_DEFAULT_TIME_ZONE: 'America/Caracas',
    IDENTITY_PROVISIONING_EMAIL_PEPPER: 'p'.repeat(48), APP_ALLOWED_ORIGINS: 'https://app.example.test',
    APP_AUTH_ACTIVATION_REDIRECT_URL: 'https://app.example.test/auth/callback' }));
});
