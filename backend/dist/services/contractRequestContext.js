import { randomUUID } from 'node:crypto';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_IP_PATTERN = /^[^\u0000-\u001F\u007F]{1,128}$/u;
export function resolveContractRequestId(suppliedRequestId, generateRequestId = randomUUID) {
    const supplied = suppliedRequestId?.trim();
    if (supplied && REQUEST_ID_PATTERN.test(supplied))
        return supplied;
    const generated = generateRequestId().trim();
    if (REQUEST_ID_PATTERN.test(generated))
        return generated;
    return randomUUID();
}
export function normalizeContractRequestIp(ip) {
    const normalized = ip?.trim();
    return normalized && SAFE_IP_PATTERN.test(normalized) ? normalized : 'unknown';
}
//# sourceMappingURL=contractRequestContext.js.map