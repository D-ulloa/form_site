import { sanitizeSheetValue } from '../utils/sanitizeSheetValue.js';
export class ContractMappingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ContractMappingError';
    }
}
/**
 * Maps fields in schema section order. Column labels are metadata only because
 * duplicate Google Form labels make header-name lookup ambiguous.
 */
export function mapContractFieldsToSheetRow(schema, fields) {
    const definitions = schema.sections.flatMap((section) => section.fields);
    const fieldNames = definitions.map((field) => field.name);
    const expectedNames = new Set(fieldNames);
    if (expectedNames.size !== fieldNames.length) {
        throw new ContractMappingError(`Schema ${schema.schemaId} contains duplicate field names.`);
    }
    const unexpectedMappings = Object.keys(schema.columnMap).filter((fieldName) => !expectedNames.has(fieldName));
    if (unexpectedMappings.length > 0) {
        throw new ContractMappingError(`Schema ${schema.schemaId} maps unknown fields: ${unexpectedMappings.join(', ')}.`);
    }
    const unexpectedFields = Object.keys(fields).filter((fieldName) => !expectedNames.has(fieldName));
    if (unexpectedFields.length > 0) {
        throw new ContractMappingError(`Submission contains unmapped fields: ${unexpectedFields.join(', ')}.`);
    }
    const columnHeaders = [];
    const values = [];
    for (const field of definitions) {
        const header = schema.columnMap[field.name]?.trim();
        if (!header) {
            throw new ContractMappingError(`Schema ${schema.schemaId} has no Sheet column mapping for ${field.name}.`);
        }
        if (!Object.prototype.hasOwnProperty.call(fields, field.name)) {
            if (field.required) {
                throw new ContractMappingError(`Validated submission is missing required field ${field.name}.`);
            }
            columnHeaders.push(header);
            values.push('');
            continue;
        }
        const value = fields[field.name];
        if (value === undefined) {
            throw new ContractMappingError(`Validated submission has an undefined value for ${field.name}.`);
        }
        columnHeaders.push(header);
        values.push(sanitizeSheetValue(value));
    }
    return { fieldNames, columnHeaders, values };
}
//# sourceMappingURL=contractSheetRowMapper.js.map