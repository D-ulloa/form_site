import { Router, type Request } from 'express';
import { clearContractPasswordSessionCookie, serializeContractPasswordSessionCookie, type ContractPasswordCredentials, type ContractGoogleAccessToken, type ContractPasswordSession, type ContractPasswordSessionData } from '../services/contractPasswordAuth.js';
export interface ContractPasswordAuthRouterDependencies {
    readonly environment: NodeJS.ProcessEnv;
    readonly register: (credentials: ContractPasswordCredentials, environment: NodeJS.ProcessEnv) => Promise<ContractPasswordSessionData>;
    readonly login: (credentials: ContractPasswordCredentials, environment: NodeJS.ProcessEnv) => Promise<ContractPasswordSessionData>;
    readonly googleLogin: (credentials: ContractGoogleAccessToken, environment: NodeJS.ProcessEnv) => Promise<ContractPasswordSessionData>;
    readonly getSession: (req: Request, environment: NodeJS.ProcessEnv) => ContractPasswordSession | null;
    readonly serializeSessionCookie: typeof serializeContractPasswordSessionCookie;
    readonly clearSessionCookie: typeof clearContractPasswordSessionCookie;
}
export declare function createContractPasswordAuthRouter(dependencyOverrides?: Partial<ContractPasswordAuthRouterDependencies>): Router;
declare const _default: Router;
export default _default;
//# sourceMappingURL=contractPasswordAuth.d.ts.map