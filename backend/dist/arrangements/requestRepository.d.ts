import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { OrganizationScope } from '../platform/scope.js';
import type { OrganizationActorContext } from '../organizations/types.js';
export declare const ArrangementStatus: z.ZodEnum<{
    rejected: "rejected";
    open: "open";
    in_progress: "in_progress";
    solved: "solved";
    archived: "archived";
}>;
export declare const WorkReportStatus: z.ZodEnum<{
    accepted: "accepted";
    draft: "draft";
    submitted: "submitted";
}>;
export declare const WorkReport: z.ZodObject<{
    status: z.ZodEnum<{
        accepted: "accepted";
        draft: "draft";
        submitted: "submitted";
    }>;
    body: z.ZodString;
    version: z.ZodNumber;
    created_at: z.ZodISODateTime;
    updated_at: z.ZodISODateTime;
    submitted_at: z.ZodNullable<z.ZodISODateTime>;
    accepted_at: z.ZodNullable<z.ZodISODateTime>;
    created_by: z.ZodNullable<z.ZodObject<{
        id: z.ZodUUID;
        name: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const RequestRecord: z.ZodObject<{
    id: z.ZodUUID;
    organization_id: z.ZodUUID;
    name: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<{
        rejected: "rejected";
        open: "open";
        in_progress: "in_progress";
        solved: "solved";
        archived: "archived";
    }>;
    property: z.ZodNullable<z.ZodObject<{
        id: z.ZodUUID;
        name: z.ZodString;
    }, z.core.$strict>>;
    created_at: z.ZodNullable<z.ZodISODateTime>;
    submitted_at: z.ZodNullable<z.ZodISODateTime>;
    updated_at: z.ZodNullable<z.ZodISODateTime>;
    version: z.ZodNumber;
    legacy: z.ZodBoolean;
    created_by_you: z.ZodPipe<z.ZodNullable<z.ZodBoolean>, z.ZodTransform<boolean, boolean | null>>;
    assets: z.ZodArray<z.ZodObject<{
        id: z.ZodUUID;
        display_filename: z.ZodString;
        mime: z.ZodEnum<{
            "image/jpeg": "image/jpeg";
            "image/png": "image/png";
            "image/webp": "image/webp";
            "video/mp4": "video/mp4";
            "video/webm": "video/webm";
            "video/quicktime": "video/quicktime";
        }>;
        bytes: z.ZodNumber;
    }, z.core.$strict>>;
    work_report: z.ZodNullable<z.ZodObject<{
        status: z.ZodEnum<{
            accepted: "accepted";
            draft: "draft";
            submitted: "submitted";
        }>;
        body: z.ZodString;
        version: z.ZodNumber;
        created_at: z.ZodISODateTime;
        updated_at: z.ZodISODateTime;
        submitted_at: z.ZodNullable<z.ZodISODateTime>;
        accepted_at: z.ZodNullable<z.ZodISODateTime>;
        created_by: z.ZodNullable<z.ZodObject<{
            id: z.ZodUUID;
            name: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type ArrangementRequest = z.infer<typeof RequestRecord>;
export declare class ArrangementRequestError extends Error {
    readonly code: string;
    readonly status: number;
    readonly current?: {
        id: string;
        status: string;
        version: number;
    } | undefined;
    constructor(code: string, status: number, current?: {
        id: string;
        status: string;
        version: number;
    } | undefined);
}
export interface ArrangementRequestRepository {
    call(scope: OrganizationScope, actor: OrganizationActorContext, action: string, input: Record<string, unknown>): Promise<unknown>;
}
export declare function createArrangementRequestRepository(clientOverride?: SupabaseClient, environment?: NodeJS.ProcessEnv): ArrangementRequestRepository;
//# sourceMappingURL=requestRepository.d.ts.map