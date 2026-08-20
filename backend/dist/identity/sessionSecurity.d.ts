import type { Request } from 'express';
import type { SessionTokenMaterial } from './types.js';
export declare const APPLICATION_SESSION_COOKIE = "__Host-form_site_session";
export declare const DEVELOPMENT_SESSION_COOKIE = "form_site_session";
export declare const CSRF_COOKIE = "form_site_csrf";
export declare const SESSION_HASH_VERSION = 1;
export declare class IdentityConfigurationError extends Error {
    constructor(message: string);
}
export declare function sessionPepper(environment: NodeJS.ProcessEnv): string;
export declare function hashSessionSecret(raw: string, environment: NodeJS.ProcessEnv): string;
export declare function hashCsrfToken(raw: string, environment: NodeJS.ProcessEnv): string;
export declare function secretMatches(actualRaw: string, expectedHash: string, hash: (value: string) => string): boolean;
export declare function createSessionTokenMaterial(environment: NodeJS.ProcessEnv): SessionTokenMaterial;
export declare function cookieName(environment: NodeJS.ProcessEnv): string;
export declare function parseCookies(request: Request): ReadonlyMap<string, string>;
export declare function sessionTokenFromRequest(request: Request, environment: NodeJS.ProcessEnv): string | null;
export declare function serializeSessionCookies(material: SessionTokenMaterial, environment: NodeJS.ProcessEnv, remembered: boolean, maxAgeSeconds: number): readonly string[];
export declare function clearSessionCookies(environment: NodeJS.ProcessEnv): readonly string[];
export declare function approvedOrigins(environment: NodeJS.ProcessEnv): ReadonlySet<string>;
export declare function assertMutationOrigin(request: Request, environment: NodeJS.ProcessEnv): void;
export declare function assertCsrf(request: Request, expectedHash: string, environment: NodeJS.ProcessEnv): void;
export declare class IdentityAccessError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, status: number);
}
export declare function validateIdentityEnvironment(environment: NodeJS.ProcessEnv): void;
//# sourceMappingURL=sessionSecurity.d.ts.map