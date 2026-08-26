import assert from 'node:assert/strict';
import test from 'node:test';
import type { IdentityProvisioningRepository, ProvisioningOperationRecord } from '../../src/identity/identityProvisioningRepository.js';
import { IdentityProvisioningService } from '../../src/identity/identityProvisioningService.js';
import type { IdentityProvisioningActor, IdentityProvisioningOutcome, IdentityProvisioningPurpose } from '../../src/identity/identityProvisioningTypes.js';
import type { IdentityAdminAdapter } from '../../src/identity/supabaseAdminAdapter.js';
import type { OrganizationGovernanceRepository } from '../../src/organizations/organizationRepository.js';
import { OrganizationService } from '../../src/organizations/organizationService.js';
import { manifestFingerprint, parseOrganizationProvisioningManifest } from '../../src/platform/organizationProvisioningManifest.js';
import type { OrganizationProvisioningRepository } from '../../src/platform/organizationProvisioningRepository.js';
import { OrganizationProvisioningService } from '../../src/platform/organizationProvisioningService.js';
import { OrganizationProvisioningError, type OrganizationProvisioningManifest,
  type OrganizationProvisioningOperation } from '../../src/platform/organizationProvisioningTypes.js';

const OPERATOR = '10000000-0000-4000-8000-000000000001';
const OWNER = '10000000-0000-4000-8000-000000000002';
const ORGANIZATION = '20000000-0000-4000-8000-000000000001';
const MEMBERSHIP = '30000000-0000-4000-8000-000000000001';
const environment = { ORGANIZATION_PROVISIONING_ENABLED: 'true', IDENTITY_PROVISIONING_ENABLED: 'true',
  IDENTITY_PROVISIONING_EMAIL_PEPPER: 'p'.repeat(48), PLATFORM_PROVISIONING_ENVIRONMENT: 'production',
  PLATFORM_PROVISIONING_PROJECT_REF: 'abcdefghijklmno12345',
  SUPABASE_URL: 'https://abcdefghijklmno12345.supabase.co', PLATFORM_PROVISIONING_DEPLOYMENT_IDENTITY: 'deploy-prod',
  PLATFORM_PROVISIONING_STEP_UP_SESSION_ID: '40000000-0000-4000-8000-000000000001',
  PLATFORM_PROVISIONING_APPROVAL_REFERENCE: 'CHG-36001' } as NodeJS.ProcessEnv;

function manifestObject(): OrganizationProvisioningManifest {
  return parseOrganizationProvisioningManifest(JSON.stringify({ schema_version: 1,
    operation_id: 'orgprov_customer_0001', requested_at: '2026-08-25T00:00:00.000Z',
    requested_by_operator_user_id: OPERATOR, approval_reference: 'CHG-36001',
    organization: { slug: 'customer-one', display_name: 'Customer One', legal_name: 'Customer One C.A.',
      plan_key: 'standard', locale: 'es', time_zone: 'America/Caracas' },
    initial_owner: { email: 'Owner@Example.test', display_name: 'Initial Owner', locale: 'es',
      time_zone: 'America/Caracas' } }));
}

class FakeIdentityRepository implements IdentityProvisioningRepository {
  operation: ProvisioningOperationRecord = { operation_id: '50000000-0000-4000-8000-000000000001',
    claim_state: 'created', state: 'processing', outcome: null, auth_user_id: null, profile_state: null,
    activation_required: null, provider_reconciliation_reference: null, provider_ambiguity_phase: null };
  assertActor(_actor: IdentityProvisioningActor, _purpose: IdentityProvisioningPurpose) { return Promise.resolve(); }
  claim() { return Promise.resolve(this.operation); }
  markProviderAmbiguous() { return Promise.resolve(); }
  complete(input: { user_id: string; outcome: Exclude<IdentityProvisioningOutcome, 'blocked_ambiguous' | 'blocked_ineligible'>;
    activation_required: boolean; reconciliation_reference: string }) {
    this.operation = { ...this.operation, claim_state: 'resumed', state: 'completed', outcome: input.outcome,
      auth_user_id: input.user_id, profile_state: 'created', activation_required: input.activation_required,
      provider_reconciliation_reference: input.reconciliation_reference };
    return Promise.resolve(this.operation);
  }
  block() { throw new Error('not used'); }
}

class FakeProvisioningRepository implements OrganizationProvisioningRepository {
  operation: OrganizationProvisioningOperation = { operation_id: 'orgprov_customer_0001', claim_state: 'created',
    state: 'reserved', manifest_fingerprint: '', organization_id: ORGANIZATION, organization_slug: 'customer-one',
    owner_user_id: null, owner_membership_id: MEMBERSHIP, activation_required: null, handoff_state: 'pending',
    request_id: 'request-spec36', evidence_timestamp: '2026-08-25T00:00:00.000Z' };
  slugAvailable = true;
  preflight() { return Promise.resolve({ operator_eligible: true, slug_available: this.slugAvailable,
    migration_conflict: false }); }
  claim(input: { manifest_fingerprint: string }) {
    this.operation = { ...this.operation, manifest_fingerprint: input.manifest_fingerprint };
    return Promise.resolve(this.operation);
  }
  complete(input: { owner_user_id: string; activation_required: boolean; request_id: string }) {
    this.operation = { ...this.operation, claim_state: 'resumed', state: 'completed', owner_user_id: input.owner_user_id,
      activation_required: input.activation_required, request_id: input.request_id };
    return Promise.resolve(this.operation);
  }
  get() { return Promise.resolve(this.operation); }
}

function governanceRepository(onCreate: () => void): OrganizationGovernanceRepository {
  return { async createOrganization(input) { onCreate(); return { id: input.organization_id, slug: input.slug,
    display_name: input.display_name, legal_name: input.legal_name, status: 'active', plan_key: input.plan_key,
    locale: input.locale, time_zone: input.time_zone, creation_source: input.creation_source,
    created_by_user_id: input.actor.user_id, status_reason_code: null, status_changed_at: '', created_at: '',
    updated_at: '', deleted_at: null, version: 1 }; }, async createInvitation() { throw new Error('not used'); },
    async resolveInvitation() { return null; }, async resendInvitation() { throw new Error('not used'); },
    async revokeInvitation() { throw new Error('not used'); }, async acceptInvitation() { throw new Error('not used'); },
    async markInvitationDelivery() {}, async getSettings() { return null; } };
}

function services(admin: IdentityAdminAdapter, repository = new FakeProvisioningRepository(), onCreate = () => {}) {
  return { repository, service: new OrganizationProvisioningService(repository,
    new IdentityProvisioningService(new FakeIdentityRepository(), admin, environment), admin,
    new OrganizationService(governanceRepository(onCreate)), environment) };
}

test('SPEC-36 canonical manifest fingerprints are stable and strict schemas reject secret or unknown fields', () => {
  const first = manifestObject();
  const reordered = parseOrganizationProvisioningManifest(JSON.stringify({ initial_owner: first.initial_owner,
    organization: first.organization, approval_reference: first.approval_reference,
    requested_by_operator_user_id: first.requested_by_operator_user_id, requested_at: first.requested_at,
    operation_id: first.operation_id, schema_version: 1 }));
  assert.equal(manifestFingerprint(first), manifestFingerprint(reordered));
  assert.throws(() => parseOrganizationProvisioningManifest(JSON.stringify({ ...first, password: 'never' })),
    (error: unknown) => error instanceof OrganizationProvisioningError && error.code === 'SECRET_MATERIAL_FORBIDDEN');
  assert.throws(() => parseOrganizationProvisioningManifest(JSON.stringify({ ...first, creation_source: 'migration' })),
    (error: unknown) => error instanceof OrganizationProvisioningError && error.code === 'INVALID_MANIFEST');
});

test('SPEC-36 dry-run performs reads only and reports a masked owner plan', async () => {
  let providerCreates = 0; let organizationCreates = 0;
  const admin: IdentityAdminAdapter = { async resolveByEmail() { return []; }, async createInviteOnly() {
    providerCreates += 1; throw new Error('must not create'); } };
  const { service } = services(admin, undefined, () => { organizationCreates += 1; });
  const plan = await service.dryRun(manifestObject());
  assert.equal(plan.owner_email_masked, 'o***@example.test');
  assert.equal(plan.owner_action, 'create_activation_required');
  assert.deepEqual(plan.blockers, []);
  assert.equal(providerCreates, 0); assert.equal(organizationCreates, 0);
});

test('SPEC-36 execute requires the exact fingerprint and returns a redacted safe receipt', async () => {
  let organizationCreates = 0;
  const admin: IdentityAdminAdapter = { async resolveByEmail() { return []; }, async createInviteOnly(email) {
    return { id: OWNER, email_normalized: email, activation_required: true, eligible: true }; } };
  const { service } = services(admin, undefined, () => { organizationCreates += 1; });
  const manifest = manifestObject();
  await assert.rejects(service.execute(manifest, '0'.repeat(64)),
    (error: unknown) => error instanceof OrganizationProvisioningError && error.code === 'FINGERPRINT_MISMATCH');
  const result = await service.execute(manifest, manifestFingerprint(manifest));
  assert.equal(result.result, 'created'); assert.equal(result.owner_email_masked, 'o***@example.test');
  assert.equal(result.organization_id, ORGANIZATION); assert.equal(result.owner_membership_id, MEMBERSHIP);
  assert.equal(organizationCreates, 1);
  assert.doesNotMatch(JSON.stringify(result), /Owner@|password|token|service.role/iu);
});

test('SPEC-36 replay returns already_applied without a provider or organization write', async () => {
  let providerCalls = 0; let organizationCreates = 0;
  const repository = new FakeProvisioningRepository(); const manifest = manifestObject();
  repository.slugAvailable = false;
  repository.operation = { ...repository.operation, state: 'completed', claim_state: 'replayed',
    manifest_fingerprint: manifestFingerprint(manifest), owner_user_id: OWNER, activation_required: false };
  const admin: IdentityAdminAdapter = { async resolveByEmail() { providerCalls += 1; return [{ id: OWNER,
    email_normalized: 'owner@example.test', activation_required: false, eligible: true }]; },
    async createInviteOnly() { throw new Error('must not create'); } };
  const { service } = services(admin, repository, () => { organizationCreates += 1; });
  const result = await service.execute(manifest, manifestFingerprint(manifest));
  assert.equal(result.result, 'already_applied'); assert.equal(providerCalls, 0); assert.equal(organizationCreates, 0);
});

test('SPEC-36 requires explicit reviewed evidence when operator and owner are the same identity', async () => {
  const admin: IdentityAdminAdapter = { async resolveByEmail() { return [{ id: OPERATOR,
    email_normalized: 'owner@example.test', activation_required: false, eligible: true }]; },
    async createInviteOnly() { throw new Error('must not create'); } };
  const { service } = services(admin);
  assert.deepEqual((await service.dryRun(manifestObject())).blockers, ['APPROVAL_REQUIRED']);
  const approved = parseOrganizationProvisioningManifest(JSON.stringify({ ...manifestObject(),
    operator_owner_identity_equality_approved: true }));
  assert.deepEqual((await service.dryRun(approved)).blockers, []);
});
