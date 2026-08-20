import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
function aad(binding) {
    return Buffer.from(`${binding.organization_id}\0${binding.integration_id}\0${binding.secret_type}\0${binding.version}`, 'utf8');
}
/** Envelope payload helper. The 32-byte KEK must be supplied from an external key boundary. */
export function encryptSecret(plaintext, binding, key) {
    if (key.byteLength !== 32 || plaintext.byteLength === 0)
        throw new Error('INVALID_SECRET_MATERIAL');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aad(binding));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Object.freeze({ algorithm: 'aes-256-gcm-v1', ciphertext: ciphertext.toString('base64url'),
        nonce: nonce.toString('base64url'), auth_tag: cipher.getAuthTag().toString('base64url'),
        fingerprint: createHash('sha256').update(plaintext).digest('hex') });
}
export function decryptSecret(record, binding, key) {
    if (key.byteLength !== 32 || record.algorithm !== 'aes-256-gcm-v1')
        throw new Error('INVALID_SECRET_MATERIAL');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.nonce, 'base64url'));
    decipher.setAAD(aad(binding));
    decipher.setAuthTag(Buffer.from(record.auth_tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()]);
}
export async function withSecret(store, reference, use) {
    const secret = await store.get(reference);
    try {
        return await use(secret);
    }
    finally {
        secret.fill(0);
    }
}
//# sourceMappingURL=secretBroker.js.map