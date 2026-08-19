export interface OrganizationExportManifest {
    readonly organization_id: string;
    readonly export_id: string;
    readonly schema_version: number;
    readonly time_boundary: string;
    readonly included_data_classes: readonly string[];
    readonly excluded_data_classes: readonly string[];
    readonly object_counts: Readonly<Record<string, number>>;
    readonly checksums: Readonly<Record<string, string>>;
    readonly encryption_reference: string;
    readonly expires_at: string;
}
export declare function sha256Hex(value: string | Buffer): string;
export declare function validateExportManifest(manifest: OrganizationExportManifest, expectedOrganizationId: string, now?: Date): void;
export type ExternalIntentState = 'pending' | 'processing' | 'sent' | 'unknown' | 'failed';
export type ReconciliationEvidence = 'provider_confirmed' | 'provider_missing' | 'provider_unknown';
export declare function decideRestoredIntent(state: ExternalIntentState, evidence?: ReconciliationEvidence): 'pause' | 'record_recovered_receipt' | 'resume_idempotently' | 'block';
//# sourceMappingURL=recovery.d.ts.map