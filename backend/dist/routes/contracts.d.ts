import { Router } from 'express';
import type { ContractSchemaConfig, ContractValidationResult, PublicContractSchema } from '../contracts/types.js';
import { type ContractAuditLog } from '../services/contractAuditLogger.js';
import { type ContractSubmissionReceipt, type CreateContractSubmissionInput } from '../services/createContractSubmission.js';
interface ContractRouteLogEntry {
    readonly event: 'contract_route_error';
    readonly route: 'schema' | 'submit' | 'audit';
    readonly status: number;
    readonly errorName: string;
    readonly requestId?: string;
}
export interface ContractsRouterDependencies {
    readonly environment: NodeJS.ProcessEnv;
    readonly getPublicSchema: (schemaId: string, environment: NodeJS.ProcessEnv) => PublicContractSchema;
    readonly getConfig: (schemaId: string, environment: NodeJS.ProcessEnv) => ContractSchemaConfig;
    readonly validateSubmission: (raw: unknown) => ContractValidationResult;
    readonly createSubmission: (input: CreateContractSubmissionInput) => Promise<ContractSubmissionReceipt>;
    readonly readAudit: (submissionId: string) => Promise<ContractAuditLog>;
    readonly generateRequestId: () => string;
    readonly log: (entry: ContractRouteLogEntry) => void;
}
export declare function createContractsRouter(dependencyOverrides?: Partial<ContractsRouterDependencies>): Router;
declare const _default: Router;
export default _default;
//# sourceMappingURL=contracts.d.ts.map