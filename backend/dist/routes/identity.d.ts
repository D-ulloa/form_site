import { Router, type NextFunction, type Request, type Response } from 'express';
import type { IdentityRepository } from '../identity/identityRepository.js';
import { SessionService } from '../identity/sessionService.js';
import type { IdentityProvider } from '../identity/supabaseIdentityProvider.js';
export declare function createIdentityRouter(service: SessionService, provider: IdentityProvider, environment?: NodeJS.ProcessEnv): Router;
export declare function createOrganizationContextRouter(service: SessionService, repository: IdentityRepository, environment?: NodeJS.ProcessEnv): Router;
export declare function createTenantMutationSecurity(service: SessionService, environment?: NodeJS.ProcessEnv): (request: Request, response: Response, next: NextFunction) => void;
//# sourceMappingURL=identity.d.ts.map