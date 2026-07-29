import type { ContractFieldValue } from '../contracts/types.js';

const FORMULA_PREFIX = /^\s*[=+@-]/u;

/**
 * Makes user-provided strings inert even if a caller later changes the Sheets
 * input mode from RAW. Non-string values retain their native Sheets type.
 */
export function sanitizeSheetValue(
  value: ContractFieldValue,
): ContractFieldValue {
  if (typeof value === 'string' && FORMULA_PREFIX.test(value)) {
    return `'${value}`;
  }

  return value;
}
