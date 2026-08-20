import type { IntegrationExecutionContext, LeasedDelivery } from './types.js';
export declare function assertProviderScope(context: IntegrationExecutionContext, delivery: LeasedDelivery): void;
export declare function assertDriveResourceParent(configuredParentId: unknown, actualParentIds: readonly string[]): string;
export declare function assertPrivateDrivePermissions(permissions: readonly {
    readonly type: string;
    readonly role: string;
}[]): void;
export declare function assertSheetReceipt(expectedSpreadsheetId: string, receipt: {
    readonly spreadsheet_id: string;
    readonly idempotency_key: string;
}, expectedKey: string): void;
//# sourceMappingURL=providerGuards.d.ts.map