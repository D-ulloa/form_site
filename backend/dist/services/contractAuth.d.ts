export type ContractPrincipal = {
    readonly mode: 'api_key';
} | {
    readonly mode: 'gateway' | 'development' | 'insecure_agent';
    readonly userId: string;
} | {
    readonly mode: 'supabase';
    readonly userId: string;
    readonly email: string;
    readonly isAdmin: boolean;
};
export interface ContractAuthenticationInput {
    readonly authorization: string | undefined;
    readonly authenticatedUserId: string | undefined;
    readonly developmentUserId: string | undefined;
    readonly passwordSession?: {
        readonly userId: string;
        readonly email: string;
        readonly isAdmin: boolean;
    };
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
export declare function getContractPrincipalUserId(principal: ContractPrincipal, attributedUserId?: string): string;
export declare function authorizeContractAdmin(principal: ContractPrincipal, environment?: NodeJS.ProcessEnv): void;
//# sourceMappingURL=contractAuth.d.ts.map