import type { Request } from 'express';
import { type SupabaseClient } from '@supabase/supabase-js';
export declare const CONTRACT_PASSWORD_SESSION_COOKIE = "contract_password_session";
export declare const CONTRACT_PASSWORD_SESSION_VERSION = "spec25-containment-v1";
export interface ContractPasswordSession {
    readonly userId: string;
    readonly email: string;
    readonly name: string;
    readonly isAdmin: boolean;
    readonly sessionVersion: string;
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
export interface ContractGoogleAccessToken {
    readonly accessToken: string;
    readonly rememberMe?: boolean;
}
export type ContractPasswordSessionData = Omit<ContractPasswordSession, 'expiresAt' | 'sessionVersion'>;
export declare class ContractPasswordAuthConfigurationError extends Error {
    constructor();
}
export declare class ContractPasswordAuthError extends Error {
    readonly code: 'invalid_credentials' | 'email_in_use' | 'not_admin' | 'registration_closed';
    constructor(code: 'invalid_credentials' | 'email_in_use' | 'not_admin' | 'registration_closed', message: string);
}
type ContractAuthClientFactory = (environment: NodeJS.ProcessEnv) => SupabaseClient;
export declare function clearContractPasswordSessionCookie(environment?: NodeJS.ProcessEnv): string;
export declare function getContractPasswordSession(req: Request, environment?: NodeJS.ProcessEnv): ContractPasswordSession | null;
export declare function serializeContractPasswordSessionCookie(session: ContractPasswordSessionData, environment?: NodeJS.ProcessEnv, rememberMe?: boolean): string;
export declare function registerContractUser(credentials: ContractPasswordCredentials, environment?: NodeJS.ProcessEnv): Promise<ContractPasswordSessionData>;
export declare function loginContractUser(credentials: ContractPasswordCredentials, environment?: NodeJS.ProcessEnv, clientFactory?: ContractAuthClientFactory): Promise<ContractPasswordSessionData>;
/**
 * Convert a verified Supabase Google session into the same signed application
 * session used by password authentication. The access token is verified by
 * Supabase Auth; it is never stored in the application cookie.
 */
export declare function loginContractGoogleUser(credentials: ContractGoogleAccessToken, environment?: NodeJS.ProcessEnv, clientFactory?: ContractAuthClientFactory): Promise<ContractPasswordSessionData>;
export {};
//# sourceMappingURL=contractPasswordAuth.d.ts.map