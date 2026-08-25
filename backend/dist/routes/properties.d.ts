import { Router } from 'express';
import { type ContractPasswordSession } from '../services/contractPasswordAuth.js';
import type { SessionService } from '../identity/sessionService.js';
declare const router: import("express-serve-static-core").Router;
type PropertySession = Pick<ContractPasswordSession, 'userId' | 'email' | 'name' | 'isAdmin'>;
export declare function applyVerifiedPropertyActor(body: Record<string, unknown>, session: PropertySession): void;
/**
 * Transitional adapter for the organization-scoped UI. The legacy property
 * implementation remains behind its original reviewed-admin cookie, while
 * this wrapper derives the actor from the current revocable app session and
 * confirms properties.write for the organization in the URL.
 */
export declare function createTenantPropertyCompatibilityRouter(sessions: SessionService, environment?: NodeJS.ProcessEnv): Router;
export default router;
//# sourceMappingURL=properties.d.ts.map