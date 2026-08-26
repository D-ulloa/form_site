import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationProvisioningManifest, OrganizationProvisioningOperation, OrganizationProvisioningPreflight } from './organizationProvisioningTypes.js';
export interface OrganizationProvisioningRepository {
    preflight(input: {
        readonly manifest: OrganizationProvisioningManifest;
        readonly step_up_session_id: string;
    }): Promise<OrganizationProvisioningPreflight>;
    claim(input: {
        readonly manifest: OrganizationProvisioningManifest;
        readonly manifest_fingerprint: string;
        readonly owner_email_fingerprint: string;
        readonly step_up_session_id: string;
        readonly deployment_identity: string;
        readonly target_project_ref: string;
        readonly request_id: string;
    }): Promise<OrganizationProvisioningOperation>;
    complete(input: {
        readonly operation_id: string;
        readonly manifest_fingerprint: string;
        readonly owner_user_id: string;
        readonly activation_required: boolean;
        readonly request_id: string;
    }): Promise<OrganizationProvisioningOperation>;
    get(operationId: string): Promise<OrganizationProvisioningOperation>;
}
export declare function createOrganizationProvisioningRepository(environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient): OrganizationProvisioningRepository;
//# sourceMappingURL=organizationProvisioningRepository.d.ts.map