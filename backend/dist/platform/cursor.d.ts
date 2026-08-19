export interface CursorPayload {
    readonly created_at: string;
    readonly id: string;
    readonly filter_fingerprint: string;
    readonly version: 1;
}
export declare function createCursorCodec(secret: string): {
    encode(payload: Omit<CursorPayload, "version">): string;
    decode(cursor: string, filterFingerprint: string): CursorPayload;
};
export declare function boundedPageSize(value: unknown, defaultValue?: number, maximum?: number): number;
//# sourceMappingURL=cursor.d.ts.map