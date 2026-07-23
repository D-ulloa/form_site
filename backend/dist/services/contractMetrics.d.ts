export declare const CONTRACT_METRICS: {
    readonly total: "contracts.submissions.total";
    readonly success: "contracts.submissions.success";
    readonly failure: "contracts.submissions.failure";
    readonly latency: "contracts.submissions.latency_ms";
};
export type ContractCounterMetric = typeof CONTRACT_METRICS.total | typeof CONTRACT_METRICS.success | typeof CONTRACT_METRICS.failure;
export type ContractLatencyMetric = typeof CONTRACT_METRICS.latency;
export interface ContractMetricsRecorder {
    increment(metric: ContractCounterMetric): void;
    observe(metric: ContractLatencyMetric, value: number): void;
}
export interface ContractMetricsSnapshot {
    readonly total: number;
    readonly success: number;
    readonly failure: number;
    readonly latency: {
        readonly count: number;
        readonly totalMs: number;
        readonly lastMs: number;
        readonly maxMs: number;
    };
}
export declare const contractMetrics: ContractMetricsRecorder;
export declare function getContractMetricsSnapshot(): ContractMetricsSnapshot;
//# sourceMappingURL=contractMetrics.d.ts.map