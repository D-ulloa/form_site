import { type CertificationDecision, type CertificationInput, type InventoryDecision, type InventoryDecisionInput, type MigrationManifest, type SolarRolloutStage } from './types.js';
export declare function validateMigrationManifest(manifest: MigrationManifest): void;
export declare function canonicalFingerprint(value: unknown): string;
/** Ambiguity always resolves to quarantine; first-tenant status is not ownership evidence. */
export declare function decideInventoryDisposition(input: InventoryDecisionInput): InventoryDecision;
export declare function evaluateReleaseCertification(input: CertificationInput): CertificationDecision;
export declare function assertSolarRolloutTransition(from: SolarRolloutStage, to: SolarRolloutStage, certification: CertificationDecision, boundaryIncident?: boolean): void;
//# sourceMappingURL=controlPlane.d.ts.map