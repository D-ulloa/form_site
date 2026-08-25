import { Router } from 'express';
import { SessionService } from '../identity/sessionService.js';
import { type TenantContractHttpRepository } from '../contracts/tenantContractHttpRepository.js';
export declare function createTenantContractEntriesRouter(sessions: SessionService, repository?: TenantContractHttpRepository, environment?: NodeJS.ProcessEnv): Router;
//# sourceMappingURL=tenantContractEntries.d.ts.map