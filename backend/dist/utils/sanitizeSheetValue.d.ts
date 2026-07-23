import type { ContractFieldValue } from '../contracts/types.js';
/**
 * Makes user-provided strings inert even if a caller later changes the Sheets
 * input mode from RAW. Non-string values retain their native Sheets type.
 */
export declare function sanitizeSheetValue(value: ContractFieldValue): ContractFieldValue;
//# sourceMappingURL=sanitizeSheetValue.d.ts.map