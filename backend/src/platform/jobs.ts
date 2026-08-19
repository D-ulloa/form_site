export type JobState = 'queued' | 'processing' | 'succeeded' | 'retryable' | 'dead_letter'
  | 'paused_recovery' | 'blocked_reconciliation' | 'cancelled';

export interface SchedulableJob {
  readonly id: string;
  readonly organization_id: string;
  readonly priority_band: number;
  readonly available_at: string;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly state: JobState;
}

export function fairJobOrder(jobs: readonly SchedulableJob[], now = new Date()): readonly SchedulableJob[] {
  const eligible = jobs.filter((job) => ['queued', 'retryable'].includes(job.state)
    && Date.parse(job.available_at) <= now.getTime());
  const byOrganization = new Map<string, SchedulableJob[]>();
  for (const job of eligible) {
    const values = byOrganization.get(job.organization_id) ?? [];
    values.push(job);
    byOrganization.set(job.organization_id, values);
  }
  for (const values of byOrganization.values()) {
    values.sort((a, b) => a.priority_band - b.priority_band
      || Date.parse(a.available_at) - Date.parse(b.available_at) || a.id.localeCompare(b.id));
  }
  const ordered: SchedulableJob[] = [];
  while ([...byOrganization.values()].some((values) => values.length > 0)) {
    for (const organizationId of [...byOrganization.keys()].sort()) {
      const next = byOrganization.get(organizationId)?.shift();
      if (next) ordered.push(next);
    }
  }
  return ordered;
}

export function nextRetryAt(attempt: number, now: Date, random: () => number = Math.random): Date {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('INVALID_JOB_ATTEMPT');
  const cappedSeconds = Math.min(3600, 2 ** Math.min(attempt, 12));
  const jittered = Math.max(1, Math.round(cappedSeconds * (0.5 + random() * 0.5)));
  return new Date(now.getTime() + jittered * 1000);
}

export function nextFailureState(attempts: number, maxAttempts: number): 'retryable' | 'dead_letter' {
  return attempts >= maxAttempts ? 'dead_letter' : 'retryable';
}
