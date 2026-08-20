import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSolarRolloutTransition, canonicalFingerprint, decideInventoryDisposition,
  evaluateReleaseCertification, validateMigrationManifest } from '../../src/migration/controlPlane.js';
import type { CertificationInput, MigrationManifest } from '../../src/migration/types.js';

const azar = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const solar = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const hash = 'a'.repeat(64);

function manifest(overrides: Partial<MigrationManifest> = {}): MigrationManifest {
  return { manifest_version: 'v1', environment: 'staging', mode: 'rehearsal',
    source_snapshot_id: 'snapshot-1', source_schema_version: 'legacy-4', application_revision: 'abc123',
    target_schema_version: '20260819400000', azar: { organization_id: azar, slug: 'azar' },
    solar: { organization_id: solar, slug: 'solar' }, solar_features: [
      { feature_key: 'contracts', state: 'certified_enabled', certification_reference: 'evidence/contracts' },
      { feature_key: 'billing', state: 'disabled' },
    ], rollback_thresholds: [{ metric_key: 'cross_tenant_success', operator: 'gte', limit: 1,
      observation_window_seconds: 300, action: 'contain' }], approval_references: ['approval/rehearsal'], ...overrides };
}

test('SPEC-34 manifest requires distinct fixed identities, certified features, and production gates', () => {
  assert.doesNotThrow(() => validateMigrationManifest(manifest()));
  assert.throws(() => validateMigrationManifest(manifest({ solar: { organization_id: azar, slug: 'solar' } })),
    /INVALID_FIXED_ORGANIZATION_IDS/u);
  assert.throws(() => validateMigrationManifest(manifest({ solar_features: [
    { feature_key: 'contracts', state: 'certified_enabled' },
  ] })), /MISSING_FEATURE_CERTIFICATION/u);
  assert.throws(() => validateMigrationManifest(manifest({ mode: 'production', approval_references: [],
    rollback_thresholds: [] })), /PRODUCTION_GATE_INCOMPLETE/u);
  assert.throws(() => validateMigrationManifest({ ...manifest(),
    credential_reference: 'must-not-enter-manifest' } as MigrationManifest), /SECRET_MATERIAL_FORBIDDEN/u);
});

test('SPEC-34 canonical fingerprints are stable across object key order', () => {
  assert.equal(canonicalFingerprint({ b: 2, a: { d: 4, c: 3 } }),
    canonicalFingerprint({ a: { c: 3, d: 4 }, b: 2 }));
});

test('SPEC-34 ambiguous assignment and unsafe deletion quarantine by default', () => {
  assert.deepEqual(decideInventoryDisposition({ source_fingerprint: hash,
    proposed_disposition: 'migrate_to_azar' }), {
    final_disposition: 'quarantine', reason_code: 'AZAR_OWNERSHIP_UNPROVEN', requires_review: true,
  });
  assert.equal(decideInventoryDisposition({ source_fingerprint: hash,
    proposed_disposition: 'migrate_to_azar', ownership_evidence_reference: 'inventory/42',
    approved_rule_reference: 'rule/azar-contracts', reviewer_id: 'reviewer' }).final_disposition, 'migrate_to_azar');
  assert.equal(decideInventoryDisposition({ source_fingerprint: hash,
    proposed_disposition: 'delete_after_approval', retention_approved: true, legal_hold: true,
    reviewer_id: 'reviewer' }).reason_code, 'LEGAL_HOLD');
});

function certification(overrides: Partial<CertificationInput> = {}): CertificationInput {
  return { artifact_match: true, provider_destinations_distinct: true, restore_rehearsal_passed: true,
    migration_rehearsal_passed: true, validations: [{ check_id: 'zero-cross-tenant', core_isolation: true,
      status: 'pass' }], features: manifest().solar_features,
    approval_roles: ['security','product','data','backend','frontend','operations','provider','support','release'],
    thresholds: manifest().rollback_thresholds, ...overrides };
}

test('SPEC-34 certification and Solar rollout fail closed', () => {
  const pass = evaluateReleaseCertification(certification());
  assert.equal(pass.releasable, true);
  const fail = evaluateReleaseCertification(certification({ artifact_match: false,
    validations: [{ check_id: 'rls', core_isolation: true, status: 'waived' }] }));
  assert.equal(fail.releasable, false);
  assert.deepEqual(fail.blockers, ['DEPLOYED_ARTIFACT_MISMATCH', 'CORE_ISOLATION_WAIVER_FORBIDDEN']);
  assert.doesNotThrow(() => assertSolarRolloutTransition('pilot', 'real_data', pass));
  assert.throws(() => assertSolarRolloutTransition('pilot', 'real_data', fail), /SOLAR_RELEASE_NOT_CERTIFIED/u);
  assert.throws(() => assertSolarRolloutTransition('synthetic', 'pilot', pass, true),
    /BOUNDARY_INCIDENT_REQUIRES_CONTAINMENT/u);
  assert.doesNotThrow(() => assertSolarRolloutTransition('synthetic', 'contained', fail, true));
});
