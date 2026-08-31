import type { AuthMethod, SessionIdentity } from './types.js';
export interface IdentityProvider {
    password(email: string, password: string): Promise<SessionIdentity>;
    accessToken(accessToken: string, expectedMethod: AuthMethod): Promise<SessionIdentity>;
    requestPasswordReset(email: string, redirectTo: string): Promise<void>;
    updatePassword(userId: string, password: string): Promise<void>;
    updateEmail(userId: string, email: string): Promise<void>;
    activateInvitationUser(userId: string, expectedEmail: string, password: string, displayName: string): Promise<void>;
}
export declare function createSupabaseIdentityProvider(environment?: NodeJS.ProcessEnv): IdentityProvider;
//# sourceMappingURL=supabaseIdentityProvider.d.ts.map