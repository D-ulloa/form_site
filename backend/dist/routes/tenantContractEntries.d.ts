import { Router } from 'express';
import { SessionService } from '../identity/sessionService.js';
import { type TenantContractHttpRepository } from '../contracts/tenantContractHttpRepository.js';
import type { ContractMakeDeliveryRunner } from '../integrations/contractMakeDeliveryRunner.js';
export declare function createTenantContractEntriesRouter(sessions: SessionService, repository?: TenantContractHttpRepository, environment?: NodeJS.ProcessEnv, contractMakeDeliveryRunner?: ContractMakeDeliveryRunner): Router;
//# sourceMappingURL=tenantContractEntries.d.ts.map