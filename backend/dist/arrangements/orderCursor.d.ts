export interface OrderCursorBinding {
    readonly organization_id: string;
    readonly status: string | null;
    readonly limit: number;
}
export declare function createOrderCursorCodec(secret: string): {
    encode(afterId: string, binding: OrderCursorBinding): string;
    decode(cursor: string, binding: OrderCursorBinding): string;
};
//# sourceMappingURL=orderCursor.d.ts.map