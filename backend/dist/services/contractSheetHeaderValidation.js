export class ContractSheetMappingConfigurationError extends Error {
    retriable = false;
    expectedHeaders;
    actualHeaders;
    constructor(expectedHeaders, actualHeaders) {
        const mismatchIndex = expectedHeaders.findIndex((header, index) => actualHeaders[index] !== header);
        const firstMismatch = mismatchIndex >= 0
            ? ` First mismatch at column ${mismatchIndex + 1}: expected "${expectedHeaders[mismatchIndex]}", received "${actualHeaders[mismatchIndex] ?? '(missing)'}".`
            : '';
        super(`Contract Sheet headers do not match the registered schema (${expectedHeaders.length} expected, ${actualHeaders.length} received).${firstMismatch} Update the configured tab headers before retrying.`);
        this.name = 'ContractSheetMappingConfigurationError';
        this.expectedHeaders = [...expectedHeaders];
        this.actualHeaders = [...actualHeaders];
    }
}
export function buildContractSheetHeaderReadRequest(input) {
    const quotedSheetName = `'${input.sheetName.replace(/'/gu, "''")}'`;
    return {
        spreadsheetId: input.spreadsheetId,
        range: `${quotedSheetName}!1:1`,
        majorDimension: 'ROWS',
        valueRenderOption: 'FORMATTED_VALUE',
    };
}
export function assertContractSheetHeaders(expectedHeaders, response) {
    const row = response.data?.values?.[0] ?? [];
    const actualHeaders = row.map((value) => typeof value === 'string' ? value : String(value ?? ''));
    const matches = actualHeaders.length === expectedHeaders.length &&
        expectedHeaders.every((header, index) => actualHeaders[index] === header);
    if (!matches) {
        throw new ContractSheetMappingConfigurationError(expectedHeaders, actualHeaders);
    }
}
//# sourceMappingURL=contractSheetHeaderValidation.js.map