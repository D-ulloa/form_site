import type { AuthMethod, SessionIdentity } from './types.js';
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
/** Additional Auth-admin surface used only by SPEC-41's public onboarding service. */
export interface SelfServiceIdentityAdminAdapter extends IdentityAdminAdapter {
    createPassword(emailNormalized: string, password: string, displayName: string): Promise<SessionIdentity>;
    sessionIdentity(userId: string, method: AuthMethod): Promise<SessionIdentity>;
}
export declare class IdentityProviderUnavailableError extends Error {
    constructor();
}
export declare class IdentityProviderAmbiguousError extends Error {
    constructor();
}
/** The only Auth Admin surface exposed to provisioning code. */
export declare function createSupabaseAdminAdapter(environment?: NodeJS.ProcessEnv): SelfServiceIdentityAdminAdapter;
//# sourceMappingURL=supabaseAdminAdapter.d.ts.map