export function fairJobOrder(jobs, now = new Date()) {
    const eligible = jobs.filter((job) => ['queued', 'retryable'].includes(job.state)
        && Date.parse(job.available_at) <= now.getTime());
    const byOrganization = new Map();
    for (const job of eligible) {
        const values = byOrganization.get(job.organization_id) ?? [];
        values.push(job);
        byOrganization.set(job.organization_id, values);
    }
    for (const values of byOrganization.values()) {
        values.sort((a, b) => a.priority_band - b.priority_band
            || Date.parse(a.available_at) - Date.parse(b.available_at) || a.id.localeCompare(b.id));
    }
    const ordered = [];
    while ([...byOrganization.values()].some((values) => values.length > 0)) {
        for (const organizationId of [...byOrganization.keys()].sort()) {
            const next = byOrganization.get(organizationId)?.shift();
            if (next)
                ordered.push(next);
        }
    }
    return ordered;
}
export function nextRetryAt(attempt, now, random = Math.random) {
    if (!Number.isInteger(attempt) || attempt < 1)
        throw new Error('INVALID_JOB_ATTEMPT');
    const cappedSeconds = Math.min(3600, 2 ** Math.min(attempt, 12));
    const jittered = Math.max(1, Math.round(cappedSeconds * (0.5 + random() * 0.5)));
    return new Date(now.getTime() + jittered * 1000);
}
export function nextFailureState(attempts, maxAttempts) {
    return attempts >= maxAttempts ? 'dead_letter' : 'retryable';
}
//# sourceMappingURL=jobs.js.map