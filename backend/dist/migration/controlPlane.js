import { createHash } from 'node:crypto';
import { FEATURE_STATES, MIGRATION_MODES } from './types.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const KEY = /^[a-z][a-z0-9_]{0,63}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const SECRET_KEY = /(secret|password|token|private_key|credential)/iu;
const REQUIRED_APPROVAL_ROLES = ['security', 'product', 'data', 'backend', 'frontend', 'operations',
    'provider', 'support', 'release'];
function requireText(value, code) {
    if (typeof value !== 'string' || !value.trim() || value.length > 256)
        throw new Error(code);
}
function assertNoSecretMaterial(value, path = 'manifest') {
    if (Array.isArray(value))
        return value.forEach((item, index) => assertNoSecretMaterial(item, `${path}.${index}`));
    if (!value || typeof value !== 'object')
        return;
    for (const [key, child] of Object.entries(value)) {
        if (SECRET_KEY.test(key))
            throw new Error(`SECRET_MATERIAL_FORBIDDEN:${path}.${key}`);
        assertNoSecretMaterial(child, `${path}.${key}`);
    }
}
export function validateMigrationManifest(manifest) {
    assertNoSecretMaterial(manifest);
    if (!manifest || typeof manifest !== 'object' || !manifest.azar || !manifest.solar
        || !Array.isArray(manifest.solar_features) || !Array.isArray(manifest.rollback_thresholds)
        || !Array.isArray(manifest.approval_references))
        throw new Error('INVALID_MIGRATION_MANIFEST');
    if (!MIGRATION_MODES.includes(manifest.mode))
        throw new Error('INVALID_MIGRATION_MODE');
    for (const value of [manifest.manifest_version, manifest.environment, manifest.source_snapshot_id,
        manifest.source_schema_version, manifest.application_revision, manifest.target_schema_version]) {
        requireText(value, 'MISSING_MANIFEST_IDENTITY');
    }
    if (!UUID.test(manifest.azar.organization_id) || !UUID.test(manifest.solar.organization_id)
        || manifest.azar.organization_id === manifest.solar.organization_id)
        throw new Error('INVALID_FIXED_ORGANIZATION_IDS');
    if (!SLUG.test(manifest.azar.slug) || !SLUG.test(manifest.solar.slug)
        || manifest.azar.slug === manifest.solar.slug)
        throw new Error('INVALID_FIXED_ORGANIZATION_SLUGS');
    const features = new Set();
    for (const feature of manifest.solar_features) {
        if (!KEY.test(feature.feature_key) || features.has(feature.feature_key)
            || !FEATURE_STATES.includes(feature.state))
            throw new Error('INVALID_SOLAR_FEATURE_MANIFEST');
        if (feature.state === 'certified_enabled' && !feature.certification_reference?.trim()) {
            throw new Error('MISSING_FEATURE_CERTIFICATION');
        }
        features.add(feature.feature_key);
    }
    const metrics = new Set();
    for (const threshold of manifest.rollback_thresholds) {
        validateThreshold(threshold);
        if (metrics.has(threshold.metric_key))
            throw new Error('DUPLICATE_ROLLBACK_THRESHOLD');
        metrics.add(threshold.metric_key);
    }
    for (const reference of manifest.approval_references)
        requireText(reference, 'INVALID_APPROVAL_REFERENCE');
    if (manifest.mode === 'production' && (manifest.approval_references.length === 0
        || manifest.rollback_thresholds.length === 0))
        throw new Error('PRODUCTION_GATE_INCOMPLETE');
}
function validateThreshold(threshold) {
    if (!KEY.test(threshold.metric_key) || !Number.isFinite(threshold.limit) || threshold.limit < 0
        || !['gt', 'gte'].includes(threshold.operator) || !['hold', 'rollback', 'contain'].includes(threshold.action)
        || !Number.isSafeInteger(threshold.observation_window_seconds)
        || threshold.observation_window_seconds < 60 || threshold.observation_window_seconds > 604_800) {
        throw new Error('INVALID_ROLLBACK_THRESHOLD');
    }
}
export function canonicalFingerprint(value) {
    const normalize = (input) => {
        if (Array.isArray(input))
            return input.map(normalize);
        if (input && typeof input === 'object')
            return Object.fromEntries(Object.entries(input)
                .sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, normalize(child)]));
        return input;
    };
    return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
}
/** Ambiguity always resolves to quarantine; first-tenant status is not ownership evidence. */
export function decideInventoryDisposition(input) {
    if (!HASH.test(input.source_fingerprint))
        return {
            final_disposition: 'quarantine', reason_code: 'INVALID_SOURCE_FINGERPRINT', requires_review: true,
        };
    if (input.proposed_disposition === 'migrate_to_azar' && (!input.ownership_evidence_reference?.trim()
        || !input.approved_rule_reference?.trim() || !input.reviewer_id?.trim()))
        return {
            final_disposition: 'quarantine', reason_code: 'AZAR_OWNERSHIP_UNPROVEN', requires_review: true,
        };
    if (input.proposed_disposition === 'delete_after_approval'
        && (!input.retention_approved || input.legal_hold || !input.reviewer_id?.trim()))
        return {
            final_disposition: 'quarantine', reason_code: input.legal_hold ? 'LEGAL_HOLD' : 'DELETION_NOT_APPROVED', requires_review: true,
        };
    return { final_disposition: input.proposed_disposition, reason_code: 'REVIEWED_DISPOSITION',
        requires_review: input.proposed_disposition === 'quarantine' };
}
export function evaluateReleaseCertification(input) {
    const blockers = [];
    if (!input.artifact_match)
        blockers.push('DEPLOYED_ARTIFACT_MISMATCH');
    if (!input.provider_destinations_distinct)
        blockers.push('PROVIDER_DESTINATIONS_NOT_DISTINCT');
    if (!input.restore_rehearsal_passed)
        blockers.push('RESTORE_REHEARSAL_MISSING');
    if (!input.migration_rehearsal_passed)
        blockers.push('MIGRATION_REHEARSAL_MISSING');
    if (input.validations.length === 0 || input.validations.some((result) => result.status === 'fail')) {
        blockers.push('VALIDATION_FAILURE');
    }
    if (input.validations.some((result) => result.core_isolation && result.status === 'waived')) {
        blockers.push('CORE_ISOLATION_WAIVER_FORBIDDEN');
    }
    if (input.features.some((feature) => feature.state === 'certified_enabled'
        && !feature.certification_reference?.trim()))
        blockers.push('FEATURE_CERTIFICATION_MISSING');
    if (input.thresholds.length === 0)
        blockers.push('ROLLBACK_THRESHOLDS_MISSING');
    else {
        try {
            input.thresholds.forEach(validateThreshold);
        }
        catch {
            blockers.push('ROLLBACK_THRESHOLDS_INVALID');
        }
    }
    const roles = new Set(input.approval_roles);
    if (REQUIRED_APPROVAL_ROLES.some((role) => !roles.has(role)))
        blockers.push('GO_NO_GO_APPROVALS_INCOMPLETE');
    return { releasable: blockers.length === 0, blockers: Object.freeze(blockers) };
}
const rolloutTransitions = {
    not_started: new Set(['empty', 'contained']), empty: new Set(['synthetic', 'contained']),
    synthetic: new Set(['pilot', 'contained']), pilot: new Set(['real_data', 'contained']),
    real_data: new Set(['expanded', 'contained']), expanded: new Set(['contained']), contained: new Set(),
};
export function assertSolarRolloutTransition(from, to, certification, boundaryIncident = false) {
    if (boundaryIncident && to !== 'contained')
        throw new Error('BOUNDARY_INCIDENT_REQUIRES_CONTAINMENT');
    if (!rolloutTransitions[from].has(to))
        throw new Error('INVALID_SOLAR_ROLLOUT_TRANSITION');
    if ((to === 'real_data' || to === 'expanded') && !certification.releasable) {
        throw new Error('SOLAR_RELEASE_NOT_CERTIFIED');
    }
}
//# sourceMappingURL=controlPlane.js.map