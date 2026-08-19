import { createHash } from 'node:crypto';
import { PlatformError } from '../platform/errors.js';
export function requirePropertyCapability(context, capability) {
    if (!context.capabilities.has(capability))
        throw new PlatformError('FORBIDDEN');
}
export function canSeeProperty(context, property) {
    if (property.organization_id !== context.scope.organization_id)
        return false;
    if (context.record_visibility === 'organization' || context.role === 'owner' || context.role === 'admin')
        return true;
    return property.created_by_user_id === context.user_id || property.assigned_to_user_id === context.user_id;
}
export function assertPropertyVersion(actual, expected) {
    if (!Number.isSafeInteger(expected) || expected < 1 || actual !== expected) {
        throw new PlatformError('VERSION_CONFLICT');
    }
}
export function assertPropertyLifecycle(current, next) {
    if (current === next)
        return;
    const allowed = current === 'draft' ? next === 'active' : current === 'active'
        ? next === 'archived' : next === 'active';
    if (!allowed)
        throw new PlatformError('VERSION_CONFLICT');
}
export function canRetryPropertyRun(run) {
    return run.retriable && (run.state === 'failed' || run.state === 'partially_failed' || run.state === 'blocked');
}
function stableJson(value) {
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
export function propertyRequestFingerprint(action, payload) {
    return createHash('sha256').update(action).update('\0').update(stableJson(payload)).digest('hex');
}
export function assertIdempotentReplay(storedFingerprint, action, payload) {
    if (storedFingerprint !== propertyRequestFingerprint(action, payload)) {
        throw new PlatformError('IDEMPOTENCY_CONFLICT');
    }
}
export function redactPropertyChangeSummary(previous, next) {
    const changedFields = [...new Set([...Object.keys(previous), ...Object.keys(next)])]
        .filter((key) => stableJson(previous[key]) !== stableJson(next[key])).sort();
    return Object.freeze({ changed_fields: Object.freeze(changedFields), changed_field_count: changedFields.length });
}
//# sourceMappingURL=multiTenantDomain.js.map