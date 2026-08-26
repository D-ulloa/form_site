export interface ProvisioningAuthUser {
    readonly id: string;
    readonly email_normalized: string;
    readonly activation_required: boolean;
    readonly eligible: boolean;
}
export interface IdentityAdminAdapter {
    resolveByEmail(emailNormalized: string): Promise<readonly ProvisioningAuthUser[]>;
    createInviteOnly(emailNormalized: string): Promise<ProvisioningAuthUser>;
}
export declare class IdentityProviderUnavailableError extends Error {
    constructor();
}
export declare class IdentityProviderAmbiguousError extends Error {
    constructor();
}
/** The only Auth Admin surface exposed to provisioning code. */
export declare function createSupabaseAdminAdapter(environment?: NodeJS.ProcessEnv): IdentityAdminAdapter;
//# sourceMappingURL=supabaseAdminAdapter.d.ts.map