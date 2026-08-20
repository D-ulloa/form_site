import type { IntegrationExecutionContext, LeasedDelivery } from './types.js';

export function assertProviderScope(context: IntegrationExecutionContext, delivery: LeasedDelivery): void {
  if (context.scope.organization_id !== delivery.organization_id
    || context.integration_id !== delivery.integration_id || context.provider !== delivery.provider
    || context.purpose !== delivery.purpose) throw new Error('INTEGRATION_SCOPE_MISMATCH');
}

export function assertDriveResourceParent(configuredParentId: unknown, actualParentIds: readonly string[]): string {
  if (typeof configuredParentId !== 'string' || actualParentIds.length !== 1
    || actualParentIds[0] !== configuredParentId) throw new Error('DRIVE_PARENT_MISMATCH');
  return configuredParentId;
}

export function assertPrivateDrivePermissions(permissions: readonly { readonly type: string; readonly role: string }[]): void {
  if (permissions.some((permission) => permission.type === 'anyone')) throw new Error('PUBLIC_DRIVE_PERMISSION');
}

export function assertSheetReceipt(expectedSpreadsheetId: string,
  receipt: { readonly spreadsheet_id: string; readonly idempotency_key: string }, expectedKey: string): void {
  if (receipt.spreadsheet_id !== expectedSpreadsheetId || receipt.idempotency_key !== expectedKey) {
    throw new Error('SHEET_RECEIPT_MISMATCH');
  }
}
