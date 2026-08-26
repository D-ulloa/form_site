export interface IdentityProvisioningDefaults {
    readonly display_name: string;
    readonly locale: string;
    readonly time_zone: string;
}
export declare function identityProvisioningDefaults(environment: NodeJS.ProcessEnv): IdentityProvisioningDefaults;
export declare function validateIdentityProvisioningEnvironment(environment: NodeJS.ProcessEnv): void;
//# sourceMappingURL=identityProvisioningConfig.d.ts.map