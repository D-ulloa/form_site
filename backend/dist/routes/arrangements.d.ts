import { type ArrangementPersonalDependencies } from './arrangementPersonal.js';
import { type ArrangementRequestDependencies } from './arrangementRequests.js';
import { type ArrangementPropertyDependencies } from './arrangementProperties.js';
import { Router } from 'express';
import type { SessionService } from '../identity/sessionService.js';
import { createDistributedRateLimiter } from '../platform/rateLimit.js';
import { createListArrangementOrders } from '../services/listArrangementOrders.js';
interface Dependencies extends ArrangementPropertyDependencies, ArrangementRequestDependencies, ArrangementPersonalDependencies {
    readonly list?: ReturnType<typeof createListArrangementOrders>;
    readonly limiter?: Pick<ReturnType<typeof createDistributedRateLimiter>, 'consume'>;
}
export declare function createArrangementsRouter(sessions: SessionService, environment?: NodeJS.ProcessEnv, dependencies?: Dependencies): Router;
export {};
//# sourceMappingURL=arrangements.d.ts.map