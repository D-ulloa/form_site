export interface OrganizationProvisioningTarget {
    readonly environment: 'production';
    readonly project_ref: string;
    readonly deployment_identity: string;
    readonly step_up_session_id: string;
    readonly approval_reference: string;
}
export declare function resolveOrganizationProvisioningTarget(environment: NodeJS.ProcessEnv): OrganizationProvisioningTarget;
export declare function assertOrganizationProvisioningEnabled(environment: NodeJS.ProcessEnv): void;
//# sourceMappingURL=organizationProvisioningConfig.d.ts.map