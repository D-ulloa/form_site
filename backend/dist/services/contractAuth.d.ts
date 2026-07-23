export type ContractPrincipal = {
    readonly mode: 'api_key';
} | {
    readonly mode: 'gateway' | 'development';
    readonly userId: string;
};
export interface ContractAuthenticationInput {
    readonly authorization: string | undefined;
    readonly authenticatedUserId: string | undefined;
    readonly developmentUserId: string | undefined;
}
export declare class ContractAuthenticationError extends Error {
    readonly status = 401;
    constructor(message: string);
}
export declare class ContractAuthorizationError extends Error {
    readonly status = 403;
    constructor(message: string);
}
export declare function authenticateContractRequest(input: ContractAuthenticationInput, environment?: NodeJS.ProcessEnv): ContractPrincipal;
export declare function authorizeContractUserScope(principal: ContractPrincipal, attributedUserId: string): void;
//# sourceMappingURL=contractAuth.d.ts.map