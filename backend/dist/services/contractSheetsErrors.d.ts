export declare class ContractSheetsAppendError extends Error {
    readonly retriable: boolean;
    readonly providerStatus: number | undefined;
    constructor(args: {
        message: string;
        retriable: boolean;
        providerStatus?: number;
        cause?: unknown;
    });
}
export declare function getGoogleSheetsErrorStatus(error: unknown): number | undefined;
export declare function isRetriableGoogleSheetsError(error: unknown): boolean;
//# sourceMappingURL=contractSheetsErrors.d.ts.map