import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export function hashInvitationToken(rawToken) {
    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}
export function createInvitationToken() {
    const rawToken = randomBytes(32).toString('base64url');
    return {
        raw_token: rawToken,
        token_hash: hashInvitationToken(rawToken),
        token_prefix: rawToken.slice(0, 8),
    };
}
export function invitationTokenMatches(rawToken, expectedHash) {
    if (!/^[0-9a-f]{64}$/u.test(expectedHash))
        return false;
    const actual = Buffer.from(hashInvitationToken(rawToken), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function redactInvitationSecrets(value) {
    if (Array.isArray(value))
        return value.map(redactInvitationSecrets);
    if (!value || typeof value !== 'object')
        return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
        key,
        key === 'invitation_token' || key === 'raw_token' || key === 'token_hash'
            ? '[REDACTED]'
            : redactInvitationSecrets(entry),
    ]));
}
//# sourceMappingURL=invitationTokens.js.map