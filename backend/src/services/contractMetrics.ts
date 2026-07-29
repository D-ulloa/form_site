export const CONTRACT_METRICS = {
  total: 'contracts.submissions.total',
  success: 'contracts.submissions.success',
  failure: 'contracts.submissions.failure',
  latency: 'contracts.submissions.latency_ms',
} as const;

export type ContractCounterMetric =
  | typeof CONTRACT_METRICS.total
  | typeof CONTRACT_METRICS.success
  | typeof CONTRACT_METRICS.failure;
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

class InMemoryContractMetrics implements ContractMetricsRecorder {
  private total = 0;
  private success = 0;
  private failure = 0;
  private latencyCount = 0;
  private latencyTotalMs = 0;
  private latencyLastMs = 0;
  private latencyMaxMs = 0;

  increment(metric: ContractCounterMetric): void {
    if (metric === CONTRACT_METRICS.total) this.total += 1;
    if (metric === CONTRACT_METRICS.success) this.success += 1;
    if (metric === CONTRACT_METRICS.failure) this.failure += 1;
    this.log(metric, 1);
  }

  observe(metric: ContractLatencyMetric, value: number): void {
    const normalizedValue = Number.isFinite(value) ? Math.max(0, value) : 0;
    this.latencyCount += 1;
    this.latencyTotalMs += normalizedValue;
    this.latencyLastMs = normalizedValue;
    this.latencyMaxMs = Math.max(this.latencyMaxMs, normalizedValue);
    this.log(metric, normalizedValue);
  }

  snapshot(): ContractMetricsSnapshot {
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

  private log(metric: string, value: number): void {
    console.info(JSON.stringify({
      event: 'contract_metric',
      metric,
      value,
      timestamp: new Date().toISOString(),
    }));
  }
}

const inMemoryMetrics = new InMemoryContractMetrics();

export const contractMetrics: ContractMetricsRecorder = inMemoryMetrics;

export function getContractMetricsSnapshot(): ContractMetricsSnapshot {
  return inMemoryMetrics.snapshot();
}
