import type { IdentityProvisioningService } from '../identity/identityProvisioningService.js';
import type { IdentityAdminAdapter } from '../identity/supabaseAdminAdapter.js';
import type { OrganizationService } from '../organizations/organizationService.js';
import type { OrganizationProvisioningRepository } from './organizationProvisioningRepository.js';
import { type OrganizationProvisioningManifest, type OrganizationProvisioningOperation, type OrganizationProvisioningReceipt } from './organizationProvisioningTypes.js';
export interface OrganizationProvisioningPlan {
    readonly mode: 'dry_run';
    readonly operation_id: string;
    readonly manifest_fingerprint: string;
    readonly organization_slug: string;
    readonly owner_email_masked: string;
    readonly owner_action: 'create_activation_required' | 'reuse_active' | 'reuse_activation_required';
    readonly planned_actions: readonly string[];
    readonly blockers: readonly string[];
}
export declare class OrganizationProvisioningService {
    private readonly repository;
    private readonly identity;
    private readonly identityAdmin;
    private readonly organizations;
    private readonly environment;
    constructor(repository: OrganizationProvisioningRepository, identity: IdentityProvisioningService, identityAdmin: IdentityAdminAdapter, organizations: OrganizationService, environment?: NodeJS.ProcessEnv);
    private preflight;
    dryRun(manifest: OrganizationProvisioningManifest): Promise<OrganizationProvisioningPlan>;
    execute(manifest: OrganizationProvisioningManifest, expectedFingerprint: string): Promise<OrganizationProvisioningReceipt>;
    status(operationId: string): Promise<OrganizationProvisioningOperation>;
}
//# sourceMappingURL=organizationProvisioningService.d.ts.map