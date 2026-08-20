export interface SecretStore {
    put(reference: string, plaintext: Uint8Array, metadata: Readonly<Record<string, string>>): Promise<void>;
    get(reference: string): Promise<Uint8Array>;
    revoke(reference: string): Promise<void>;
}
export interface SecretBinding {
    readonly organization_id: string;
    readonly integration_id: string;
    readonly secret_type: string;
    readonly version: number;
}
export interface EncryptedSecret {
    readonly algorithm: 'aes-256-gcm-v1';
    readonly ciphertext: string;
    readonly nonce: string;
    readonly auth_tag: string;
    readonly fingerprint: string;
}
/** Envelope payload helper. The 32-byte KEK must be supplied from an external key boundary. */
export declare function encryptSecret(plaintext: Uint8Array, binding: SecretBinding, key: Uint8Array): EncryptedSecret;
export declare function decryptSecret(record: EncryptedSecret, binding: SecretBinding, key: Uint8Array): Buffer;
export declare function withSecret<T>(store: SecretStore, reference: string, use: (secret: Uint8Array) => Promise<T>): Promise<T>;
//# sourceMappingURL=secretBroker.d.ts.map