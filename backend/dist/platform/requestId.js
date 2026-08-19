import { randomBytes } from 'node:crypto';
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
export function isValidRequestId(value) {
    return typeof value === 'string' && REQUEST_ID.test(value);
}
export function resolveRequestId(candidate) {
    return isValidRequestId(candidate) ? candidate : `req_${randomBytes(18).toString('base64url')}`;
}
export function requestIdMiddleware(req, res, next) {
    const requestId = resolveRequestId(req.header('X-Request-Id'));
    res.locals.request_id = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
}
//# sourceMappingURL=requestId.js.map