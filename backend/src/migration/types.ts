export const MIGRATION_MODES = ['dry_run', 'rehearsal', 'production', 'validation', 'rollback'] as const;
export type MigrationMode = typeof MIGRATION_MODES[number];

export const FEATURE_STATES = ['disabled', 'certified_enabled'] as const;
export type FeatureState = typeof FEATURE_STATES[number];

export interface TenantManifestIdentity {
  readonly organization_id: string;
  readonly slug: string;
}

export interface SolarFeatureSelection {
  readonly feature_key: string;
  readonly state: FeatureState;
  readonly certification_reference?: string;
}

export interface RollbackThreshold {
  readonly metric_key: string;
  readonly operator: 'gt' | 'gte';
  readonly limit: number;
  readonly observation_window_seconds: number;
  readonly action: 'hold' | 'rollback' | 'contain';
}

export interface MigrationManifest {
  readonly manifest_version: string;
  readonly environment: string;
  readonly mode: MigrationMode;
  readonly source_snapshot_id: string;
  readonly source_schema_version: string;
  readonly application_revision: string;
  readonly target_schema_version: string;
  readonly azar: TenantManifestIdentity;
  readonly solar: TenantManifestIdentity;
  readonly solar_features: readonly SolarFeatureSelection[];
  readonly rollback_thresholds: readonly RollbackThreshold[];
  readonly approval_references: readonly string[];
}

export type InventoryDisposition = 'migrate_to_azar' | 'retain_scoped' | 'quarantine'
  | 'exclude_non_business' | 'delete_after_approval';

export interface InventoryDecisionInput {
  readonly source_fingerprint: string;
  readonly proposed_disposition: InventoryDisposition;
  readonly ownership_evidence_reference?: string;
  readonly approved_rule_reference?: string;
  readonly reviewer_id?: string;
  readonly retention_approved?: boolean;
  readonly legal_hold?: boolean;
}

export interface InventoryDecision {
  readonly final_disposition: InventoryDisposition;
  readonly reason_code: string;
  readonly requires_review: boolean;
}

export interface ValidationResult {
  readonly check_id: string;
  readonly core_isolation: boolean;
  readonly status: 'pass' | 'fail' | 'waived';
}

export interface CertificationInput {
  readonly artifact_match: boolean;
  readonly provider_destinations_distinct: boolean;
  readonly restore_rehearsal_passed: boolean;
  readonly migration_rehearsal_passed: boolean;
  readonly validations: readonly ValidationResult[];
  readonly features: readonly SolarFeatureSelection[];
  readonly approval_roles: readonly string[];
  readonly thresholds: readonly RollbackThreshold[];
}

export interface CertificationDecision {
  readonly releasable: boolean;
  readonly blockers: readonly string[];
}

export type SolarRolloutStage = 'not_started' | 'empty' | 'synthetic' | 'pilot' | 'real_data' | 'expanded' | 'contained';
