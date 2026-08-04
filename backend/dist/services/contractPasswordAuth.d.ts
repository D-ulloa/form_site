import type { Request } from 'express';
export declare const CONTRACT_PASSWORD_SESSION_COOKIE = "contract_password_session";
export interface ContractPasswordSession {
    readonly userId: string;
    readonly email: string;
    readonly name: string;
    readonly isAdmin: boolean;
    readonly expiresAt: number;
}
export interface ContractPasswordCredentials {
    readonly email: string;
    readonly password: string;
    readonly name?: string;
    readonly company?: string;
    readonly role?: string;
    readonly rememberMe?: boolean;
}
export type ContractPasswordSessionData = Omit<ContractPasswordSession, 'expiresAt'>;
export declare class ContractPasswordAuthConfigurationError extends Error {
    constructor();
}
export declare class ContractPasswordAuthError extends Error {
    readonly code: 'invalid_credentials' | 'email_in_use' | 'not_admin';
    constructor(code: 'invalid_credentials' | 'email_in_use' | 'not_admin', message: string);
}
export declare function clearContractPasswordSessionCookie(environment?: NodeJS.ProcessEnv): string;
export declare function getContractPasswordSession(req: Request, environment?: NodeJS.ProcessEnv): ContractPasswordSession | null;
export declare function serializeContractPasswordSessionCookie(session: ContractPasswordSessionData, environment?: NodeJS.ProcessEnv, rememberMe?: boolean): string;
export declare function registerContractUser(credentials: ContractPasswordCredentials, environment?: NodeJS.ProcessEnv): Promise<ContractPasswordSessionData>;
export declare function loginContractUser(credentials: ContractPasswordCredentials, environment?: NodeJS.ProcessEnv): Promise<ContractPasswordSessionData>;
//# sourceMappingURL=contractPasswordAuth.d.ts.map