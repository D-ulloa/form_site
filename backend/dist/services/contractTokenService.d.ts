export declare class ContractTokenConfigurationError extends Error {
    constructor();
}
export declare function generateContractAccessToken(generateBytes?: (size: number) => Buffer): string;
export declare function hashContractAccessToken(token: string, environment?: NodeJS.ProcessEnv): string;
export declare function verifyContractAccessToken(token: string, storedHash: string, environment?: NodeJS.ProcessEnv): boolean;
//# sourceMappingURL=contractTokenService.d.ts.map