import { Router, type NextFunction, type Request, type Response } from 'express';
import type { IdentityRepository } from '../identity/identityRepository.js';
import { SessionService } from '../identity/sessionService.js';
import type { IdentityProvider } from '../identity/supabaseIdentityProvider.js';
import type { SelfServiceOnboardingService } from '../onboarding/selfServiceOnboardingService.js';
import type { createDistributedRateLimiter } from '../platform/rateLimit.js';
type RegistrationRateLimiter = ReturnType<typeof createDistributedRateLimiter>;
export declare function createIdentityRouter(service: SessionService, provider: IdentityProvider, environment?: NodeJS.ProcessEnv, onboarding?: SelfServiceOnboardingService, registrationRateLimiter?: RegistrationRateLimiter): Router;
export declare function createOrganizationContextRouter(service: SessionService, repository: IdentityRepository, environment?: NodeJS.ProcessEnv): Router;
export declare function createTenantMutationSecurity(service: SessionService, environment?: NodeJS.ProcessEnv): (request: Request, response: Response, next: NextFunction) => void;
export {};
//# sourceMappingURL=identity.d.ts.map