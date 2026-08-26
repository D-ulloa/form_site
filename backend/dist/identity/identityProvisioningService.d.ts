import type { IdentityAdminAdapter } from './supabaseAdminAdapter.js';
import type { IdentityProvisioningRepository } from './identityProvisioningRepository.js';
import type { IdentityProvisioningActor, ProvisionIdentityInput, ProvisionIdentityResult } from './identityProvisioningTypes.js';
export declare class IdentityProvisioningService {
    private readonly repository;
    private readonly admin;
    private readonly environment;
    constructor(repository: IdentityProvisioningRepository, admin: IdentityAdminAdapter, environment?: NodeJS.ProcessEnv);
    provision(input: ProvisionIdentityInput, actor: IdentityProvisioningActor): Promise<ProvisionIdentityResult>;
}
//# sourceMappingURL=identityProvisioningService.d.ts.map