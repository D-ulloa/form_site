import type { ContractFieldValue, ContractSchemaDefinition, MappedContractSheetRow } from '../contracts/types.js';
export declare class ContractMappingError extends Error {
    constructor(message: string);
}
/**
 * Maps fields in schema section order. Column labels are metadata only because
 * duplicate Google Form labels make header-name lookup ambiguous.
 */
export declare function mapContractFieldsToSheetRow(schema: ContractSchemaDefinition, fields: Readonly<Record<string, ContractFieldValue>>): MappedContractSheetRow;
//# sourceMappingURL=contractSheetRowMapper.d.ts.map