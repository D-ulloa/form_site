import type { ContractEntryRecord } from '../contracts/types.js';
export type ContractPrincipal = {
    readonly mode: 'api_key';
} | {
    readonly mode: 'gateway' | 'development';
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
/**
 * Rows without createdByUserId predate SPEC-22 and remain available to every
 * authenticated administrator. New rows carry the authenticated database ID.
 * API-key callers are trusted internal clients and intentionally remain
 * unscoped, matching the existing API-key contract boundary.
 */
export declare function canAccessContractEntry(principal: ContractPrincipal, entry: Pick<ContractEntryRecord, 'createdByUserId'>): boolean;
export declare function authorizeContractEntryAccess(principal: ContractPrincipal, entry: Pick<ContractEntryRecord, 'createdByUserId'>): void;
export declare function getContractPrincipalUserId(principal: ContractPrincipal, attributedUserId?: string): string;
export declare function authorizeContractAdmin(principal: ContractPrincipal, environment?: NodeJS.ProcessEnv): void;
//# sourceMappingURL=contractAuth.d.ts.map