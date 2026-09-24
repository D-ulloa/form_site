import type { SessionService } from '../identity/sessionService.js';
import { createDistributedRateLimiter } from '../platform/rateLimit.js';
import type { OrganizationService } from '../organizations/organizationService.js';
export interface ArrangementPersonalDependencies {
    readonly personal?: Pick<OrganizationService, 'invitePersonal' | 'rotatePersonalInvitation' | 'revokePersonalInvitation'>;
    readonly limiter?: Pick<ReturnType<typeof createDistributedRateLimiter>, 'consume'>;
}
export declare function createArrangementPersonalRouter(sessions: SessionService, environment: NodeJS.ProcessEnv, dependencies: ArrangementPersonalDependencies): import("express-serve-static-core").Router;
//# sourceMappingURL=arrangementPersonal.d.ts.map