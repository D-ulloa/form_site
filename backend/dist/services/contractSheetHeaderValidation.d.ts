export interface ContractSheetHeaderReadInput {
    readonly spreadsheetId: string;
    readonly sheetName: string;
}
export interface ContractSheetHeaderReadRequest {
    readonly spreadsheetId: string;
    readonly range: string;
    readonly majorDimension: 'ROWS';
    readonly valueRenderOption: 'FORMATTED_VALUE';
}
export interface ContractSheetHeaderReadResponse {
    readonly data?: {
        readonly values?: readonly (readonly unknown[])[] | null;
    } | null;
}
export type ContractSheetHeaderReadExecutor = (request: ContractSheetHeaderReadRequest) => Promise<ContractSheetHeaderReadResponse>;
export declare class ContractSheetMappingConfigurationError extends Error {
    readonly retriable = false;
    readonly expectedHeaders: readonly string[];
    readonly actualHeaders: readonly string[];
    constructor(expectedHeaders: readonly string[], actualHeaders: readonly string[]);
}
export declare function buildContractSheetHeaderReadRequest(input: ContractSheetHeaderReadInput): ContractSheetHeaderReadRequest;
export declare function assertContractSheetHeaders(expectedHeaders: readonly string[], response: ContractSheetHeaderReadResponse): void;
//# sourceMappingURL=contractSheetHeaderValidation.d.ts.map