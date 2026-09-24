import { type OrganizationScope } from '../platform/scope.js';
import type { ArrangementOrderPage, ArrangementOrderRepository } from '../arrangements/types.js';
export declare function createListArrangementOrders(repository: ArrangementOrderRepository, environment?: NodeJS.ProcessEnv): (scope: OrganizationScope, rawQuery: unknown) => Promise<ArrangementOrderPage>;
//# sourceMappingURL=listArrangementOrders.d.ts.map