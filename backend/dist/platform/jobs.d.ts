export type JobState = 'queued' | 'processing' | 'succeeded' | 'retryable' | 'dead_letter' | 'paused_recovery' | 'blocked_reconciliation' | 'cancelled';
export interface SchedulableJob {
    readonly id: string;
    readonly organization_id: string;
    readonly priority_band: number;
    readonly available_at: string;
    readonly attempts: number;
    readonly max_attempts: number;
    readonly state: JobState;
}
export declare function fairJobOrder(jobs: readonly SchedulableJob[], now?: Date): readonly SchedulableJob[];
export declare function nextRetryAt(attempt: number, now: Date, random?: () => number): Date;
export declare function nextFailureState(attempts: number, maxAttempts: number): 'retryable' | 'dead_letter';
//# sourceMappingURL=jobs.d.ts.map