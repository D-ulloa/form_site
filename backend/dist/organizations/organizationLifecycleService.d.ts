import type { OrganizationActorContext } from './types.js';
export declare const SPEC26_RETENTION_POLICY_VERSION = "spec25-2026-08-18";
export declare const REQUIRED_DELETION_RECEIPTS: readonly ["database", "storage", "providers", "integration_secrets", "jobs", "exports", "logs_audit", "backups", "billing"];
export type DeletionReceiptDomain = typeof REQUIRED_DELETION_RECEIPTS[number];
export declare function assertDeletionCanFinalize(input: {
    readonly active_legal_hold: boolean;
    readonly completed_receipts: readonly DeletionReceiptDomain[];
}): void;
export declare class OrganizationLifecycleService {
    requestExport(actor: OrganizationActorContext): never;
    requestDeletion(actor: OrganizationActorContext): never;
}
//# sourceMappingURL=organizationLifecycleService.d.ts.map