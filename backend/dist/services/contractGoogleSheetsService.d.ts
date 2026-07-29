import type { ContractFieldValue } from '../contracts/types.js';
import { type ContractSheetHeaderReadExecutor } from './contractSheetHeaderValidation.js';
export interface ContractSheetAppendInput {
    readonly spreadsheetId: string;
    readonly sheetName: string;
    readonly columnHeaders: readonly string[];
    readonly row: readonly ContractFieldValue[];
}
export interface ContractSheetAppendRequest {
    readonly spreadsheetId: string;
    readonly range: string;
    readonly valueInputOption: 'RAW';
    readonly requestBody: {
        readonly values: readonly (readonly ContractFieldValue[])[];
    };
}
export interface ContractSheetAppendResponse {
    readonly data?: {
        readonly updates?: {
            readonly updatedRange?: string | null;
        } | null;
    } | null;
}
export interface ContractSheetAppendResult {
    readonly appendedRange: string;
}
export type ContractSheetAppendExecutor = (request: ContractSheetAppendRequest) => Promise<ContractSheetAppendResponse>;
export interface ContractSheetAppendDependencies {
    readonly execute: ContractSheetAppendExecutor;
    readonly readHeaders: ContractSheetHeaderReadExecutor;
    readonly sleep: (delayMs: number) => Promise<void>;
    readonly maxAttempts: number;
    readonly initialDelayMs: number;
}
export declare function buildContractSheetAppendRequest(input: ContractSheetAppendInput): ContractSheetAppendRequest;
export declare function appendContractSheetRow(input: ContractSheetAppendInput, overrides?: Partial<ContractSheetAppendDependencies>): Promise<ContractSheetAppendResult>;
//# sourceMappingURL=contractGoogleSheetsService.d.ts.map