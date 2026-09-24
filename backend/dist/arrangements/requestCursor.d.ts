import { z } from 'zod';
declare const Position: z.ZodObject<{
    id: z.ZodUUID;
    at: z.ZodNullable<z.ZodISODateTime>;
}, z.core.$strict>;
export declare function createRequestCursorCodec(secret: string, binding: {
    organization_id: string;
    property_id: string | null;
    status: string | null;
    limit: number;
    audience?: string;
    membership_id?: string;
    ordering?: string;
}): {
    encode(position: z.infer<typeof Position>): string;
    decode(cursor: string): {
        id: string;
        at: string | null;
    };
};
export {};
//# sourceMappingURL=requestCursor.d.ts.map