export declare function redactTelemetry(value: unknown, depth?: number): unknown;
export interface StructuredLogSink {
    write(event: Readonly<Record<string, unknown>>): void | Promise<void>;
}
export declare function createStructuredLogger(sink: StructuredLogSink): {
    write(event: Readonly<Record<string, unknown>>): Promise<void>;
};
//# sourceMappingURL=redaction.d.ts.map