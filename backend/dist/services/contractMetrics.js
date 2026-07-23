export const CONTRACT_METRICS = {
    total: 'contracts.submissions.total',
    success: 'contracts.submissions.success',
    failure: 'contracts.submissions.failure',
    latency: 'contracts.submissions.latency_ms',
};
class InMemoryContractMetrics {
    total = 0;
    success = 0;
    failure = 0;
    latencyCount = 0;
    latencyTotalMs = 0;
    latencyLastMs = 0;
    latencyMaxMs = 0;
    increment(metric) {
        if (metric === CONTRACT_METRICS.total)
            this.total += 1;
        if (metric === CONTRACT_METRICS.success)
            this.success += 1;
        if (metric === CONTRACT_METRICS.failure)
            this.failure += 1;
        this.log(metric, 1);
    }
    observe(metric, value) {
        const normalizedValue = Number.isFinite(value) ? Math.max(0, value) : 0;
        this.latencyCount += 1;
        this.latencyTotalMs += normalizedValue;
        this.latencyLastMs = normalizedValue;
        this.latencyMaxMs = Math.max(this.latencyMaxMs, normalizedValue);
        this.log(metric, normalizedValue);
    }
    snapshot() {
        return {
            total: this.total,
            success: this.success,
            failure: this.failure,
            latency: {
                count: this.latencyCount,
                totalMs: this.latencyTotalMs,
                lastMs: this.latencyLastMs,
                maxMs: this.latencyMaxMs,
            },
        };
    }
    log(metric, value) {
        console.info(JSON.stringify({
            event: 'contract_metric',
            metric,
            value,
            timestamp: new Date().toISOString(),
        }));
    }
}
const inMemoryMetrics = new InMemoryContractMetrics();
export const contractMetrics = inMemoryMetrics;
export function getContractMetricsSnapshot() {
    return inMemoryMetrics.snapshot();
}
//# sourceMappingURL=contractMetrics.js.map