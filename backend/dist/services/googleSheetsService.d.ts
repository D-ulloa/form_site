/**
 * Appends a single row to the configured Google Sheet.
 * Column ordering is determined by the caller (sheetRowMapper).
 */
export declare function appendSheetRow(row: (string | number | boolean)[]): Promise<void>;
export { appendContractSheetRow, buildContractSheetAppendRequest, } from "./contractGoogleSheetsService.js";
export type { ContractSheetAppendDependencies, ContractSheetAppendExecutor, ContractSheetAppendInput, ContractSheetAppendRequest, ContractSheetAppendResponse, ContractSheetAppendResult, } from "./contractGoogleSheetsService.js";
export { ContractSheetsAppendError, getGoogleSheetsErrorStatus, isRetriableGoogleSheetsError, } from "./contractSheetsErrors.js";
//# sourceMappingURL=googleSheetsService.d.ts.map