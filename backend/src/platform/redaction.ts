const SECRET_KEY = /(?:authorization|cookie|password|secret|token|hash|signed(?:_|)url|storage(?:_|)path|credential|dni|document|payload|email|phone|address|name)/iu;
const URL_WITH_SIGNATURE = /https?:\/\/\S+(?:token|signature|x-amz-signature|sig)=/iu;
const MAX_DEPTH = 8;
const MAX_STRING = 512;

export function redactTelemetry(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (typeof value === 'string') {
    if (URL_WITH_SIGNATURE.test(value)) return '[REDACTED]';
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}[TRUNCATED]` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 64).map((item) => redactTelemetry(item, depth + 1));
  if (value && typeof value === 'object') {
    const safe: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 64)) {
      safe[key] = SECRET_KEY.test(key) ? '[REDACTED]' : redactTelemetry(item, depth + 1);
    }
    return safe;
  }
  return value;
}

export interface StructuredLogSink {
  write(event: Readonly<Record<string, unknown>>): void | Promise<void>;
}

export function createStructuredLogger(sink: StructuredLogSink) {
  return {
    async write(event: Readonly<Record<string, unknown>>): Promise<void> {
      await sink.write({ schema_version: 1, ...redactTelemetry(event) as Record<string, unknown> });
    },
  };
}
