import type { SessionService } from '../identity/sessionService.js';
import { createDistributedRateLimiter } from '../platform/rateLimit.js';
import { createArrangementPropertiesService } from '../services/arrangementProperties.js';
import type { OrganizationService } from '../organizations/organizationService.js';
export interface ArrangementPropertyDependencies {
    readonly properties?: ReturnType<typeof createArrangementPropertiesService>;
    readonly organizations?: Pick<OrganizationService, 'inviteMember'>;
    readonly limiter?: Pick<ReturnType<typeof createDistributedRateLimiter>, 'consume'>;
}
export declare function createArrangementPropertiesRouter(sessions: SessionService, environment: NodeJS.ProcessEnv, dependencies: ArrangementPropertyDependencies): import("express-serve-static-core").Router;
//# sourceMappingURL=arrangementProperties.d.ts.map