export function parseTrustProxyHops(rawValue) {
    const value = rawValue?.trim();
    if (!value || !/^\d+$/u.test(value))
        return 0;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
//# sourceMappingURL=serverConfig.js.map