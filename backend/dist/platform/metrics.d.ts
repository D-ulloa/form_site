export declare const REQUIRED_METRIC_FAMILIES: readonly ["authorization.denied", "session.revocation", "token.validation", "upload.failure", "queue.depth", "queue.oldest_age", "worker.retry", "worker.dead_letter", "provider.latency", "rate_limit.decision", "rate_limit.health", "quota.consumption", "quota.denial", "database.pool", "database.query_latency", "database.lock_wait", "backup.age", "restore.drill", "audit.append_failure"];
export interface MetricsSink {
    record(name: string, value: number, labels: Readonly<Record<string, string>>): void | Promise<void>;
}
export declare function createSafeMetrics(sink: MetricsSink): {
    record(name: string, value: number, labels?: Readonly<Record<string, string>>): Promise<void>;
};
//# sourceMappingURL=metrics.d.ts.map