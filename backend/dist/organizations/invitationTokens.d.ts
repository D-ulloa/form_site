export interface InvitationTokenMaterial {
    readonly raw_token: string;
    readonly token_hash: string;
    readonly token_prefix: string;
}
export declare function hashInvitationToken(rawToken: string): string;
export declare function createInvitationToken(): InvitationTokenMaterial;
export declare function invitationTokenMatches(rawToken: string, expectedHash: string): boolean;
export declare function redactInvitationSecrets(value: unknown): unknown;
//# sourceMappingURL=invitationTokens.d.ts.map