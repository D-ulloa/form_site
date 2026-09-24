import type { SessionService } from '../identity/sessionService.js';
import { createDistributedRateLimiter } from '../platform/rateLimit.js';
import { createArrangementRequestsService } from '../services/arrangementRequests.js';
export interface ArrangementRequestDependencies {
    requests?: ReturnType<typeof createArrangementRequestsService>;
    limiter?: Pick<ReturnType<typeof createDistributedRateLimiter>, 'consume'>;
}
export declare function createArrangementRequestsRouter(sessions: SessionService, environment: NodeJS.ProcessEnv, dependencies?: ArrangementRequestDependencies, legacyList?: boolean): import("express-serve-static-core").Router;
//# sourceMappingURL=arrangementRequests.d.ts.map