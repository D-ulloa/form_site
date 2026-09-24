import { z } from 'zod';
import { type ArrangementRequestRepository } from '../arrangements/requestRepository.js';
import type { OrganizationActorContext, OrganizationCapability } from '../organizations/types.js';
import type { OrganizationScope } from '../platform/scope.js';
import type { PrivateAssetStorageAdapter } from '../assets/storageAdapter.js';
export type ArrangementAudience = 'manager' | 'viewer' | 'tenant' | 'personal';
export declare const Assignee: z.ZodObject<{
    id: z.ZodUUID;
    name: z.ZodNullable<z.ZodString>;
    occupation: z.ZodNullable<z.ZodString>;
    available: z.ZodBoolean;
}, z.core.$strict>;
export declare const PersonalRequest: z.ZodObject<{
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
    requester: z.ZodNullable<z.ZodObject<{
        name: z.ZodNullable<z.ZodString>;
        email: z.ZodNullable<z.ZodString>;
        contact_number: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const ManagerRequest: z.ZodObject<{
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
    requester: z.ZodNullable<z.ZodObject<{
        name: z.ZodNullable<z.ZodString>;
        email: z.ZodNullable<z.ZodString>;
        contact_number: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
    assignee: z.ZodNullable<z.ZodObject<{
        id: z.ZodUUID;
        name: z.ZodNullable<z.ZodString>;
        occupation: z.ZodNullable<z.ZodString>;
        available: z.ZodBoolean;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare function arrangementAudience(actor: OrganizationActorContext): ArrangementAudience;
export declare function arrangementReadCapability(audience: ArrangementAudience): OrganizationCapability;
export declare function createArrangementAssignmentsService(repository: ArrangementRequestRepository, storage: PrivateAssetStorageAdapter, environment: NodeJS.ProcessEnv): {
    listAssigned(scope: OrganizationScope, actor: OrganizationActorContext, audience: ArrangementAudience, raw: unknown): Promise<{
        organization_id: string;
        items: {
            id: string;
            organization_id: string;
            name: string;
            description: string | null;
            status: "rejected" | "open" | "in_progress" | "solved" | "archived";
            property: {
                id: string;
                name: string;
            } | null;
            created_at: string | null;
            submitted_at: string | null;
            updated_at: string | null;
            version: number;
            legacy: boolean;
            created_by_you: boolean;
            assets: {
                id: string;
                display_filename: string;
                mime: "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm" | "video/quicktime";
                bytes: number;
            }[];
            work_report: {
                status: "accepted" | "draft" | "submitted";
                body: string;
                version: number;
                created_at: string;
                updated_at: string;
                submitted_at: string | null;
                accepted_at: string | null;
                created_by: {
                    id: string;
                    name: string;
                } | null;
            } | null;
        }[];
        available_statuses: ("rejected" | "open" | "in_progress" | "solved" | "archived")[];
        next_cursor: string | null;
    }>;
    assignees(scope: OrganizationScope, actor: OrganizationActorContext, raw: unknown): Promise<{
        organization_id: string;
        items: {
            id: string;
            name: string;
            occupation: string;
        }[];
        next_cursor: string | null;
    }>;
    detail(scope: OrganizationScope, actor: OrganizationActorContext, audience: ArrangementAudience, orderId: string): Promise<{
        name: string;
        description: string | null;
        status: "rejected" | "open" | "in_progress" | "solved" | "archived";
        property: {
            id: string;
            name: string;
        } | null;
        created_at: string | null;
        submitted_at: string | null;
        updated_at: string | null;
        version: number;
        legacy: boolean;
        created_by_you: boolean;
        assets: {
            id: string;
            display_filename: string;
            mime: "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm" | "video/quicktime";
            bytes: number;
        }[];
        work_report: {
            status: "accepted" | "draft" | "submitted";
            body: string;
            version: number;
            created_at: string;
            updated_at: string;
            submitted_at: string | null;
            accepted_at: string | null;
            created_by: {
                id: string;
                name: string;
            } | null;
        } | null;
        id: string;
        organization_id: string;
    }>;
    assignedView(scope: OrganizationScope, actor: OrganizationActorContext, audience: ArrangementAudience, orderId: string, assetId: string): Promise<{
        readonly signed_url: string;
        readonly expires_at: string;
    }>;
    mutateAssignment(scope: OrganizationScope, actor: OrganizationActorContext, orderId: string, action: "assign" | "unassign" | "reject" | "status", raw: unknown): Promise<{
        name: string;
        description: string | null;
        status: "rejected" | "open" | "in_progress" | "solved" | "archived";
        property: {
            id: string;
            name: string;
        } | null;
        created_at: string | null;
        submitted_at: string | null;
        updated_at: string | null;
        version: number;
        legacy: boolean;
        created_by_you: boolean;
        assets: {
            id: string;
            display_filename: string;
            mime: "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm" | "video/quicktime";
            bytes: number;
        }[];
        work_report: {
            status: "accepted" | "draft" | "submitted";
            body: string;
            version: number;
            created_at: string;
            updated_at: string;
            submitted_at: string | null;
            accepted_at: string | null;
            created_by: {
                id: string;
                name: string;
            } | null;
        } | null;
        requester: {
            name: string | null;
            email: string | null;
            contact_number: string | null;
        } | null;
        assignee: {
            id: string;
            name: string | null;
            occupation: string | null;
            available: boolean;
        } | null;
        id: string;
        organization_id: string;
    }>;
    changes(scope: OrganizationScope, actor: OrganizationActorContext, audience: ArrangementAudience): Promise<{
        revision: string;
    }>;
    saveWorkReport(scope: OrganizationScope, actor: OrganizationActorContext, orderId: string, raw: unknown): Promise<{
        status: "rejected" | "open" | "in_progress" | "solved" | "archived";
        version: number;
        work_report: {
            status: "accepted" | "draft" | "submitted";
            body: string;
            version: number;
            created_at: string;
            updated_at: string;
            submitted_at: string | null;
            accepted_at: string | null;
            created_by: {
                id: string;
                name: string;
            } | null;
        };
        id: string;
    }>;
    submitWorkReport(scope: OrganizationScope, actor: OrganizationActorContext, orderId: string, raw: unknown): Promise<{
        status: "rejected" | "open" | "in_progress" | "solved" | "archived";
        version: number;
        work_report: {
            status: "accepted" | "draft" | "submitted";
            body: string;
            version: number;
            created_at: string;
            updated_at: string;
            submitted_at: string | null;
            accepted_at: string | null;
            created_by: {
                id: string;
                name: string;
            } | null;
        };
        id: string;
    }>;
    acceptWorkReport(scope: OrganizationScope, actor: OrganizationActorContext, orderId: string, raw: unknown): Promise<{
        name: string;
        description: string | null;
        status: "rejected" | "open" | "in_progress" | "solved" | "archived";
        property: {
            id: string;
            name: string;
        } | null;
        created_at: string | null;
        submitted_at: string | null;
        updated_at: string | null;
        version: number;
        legacy: boolean;
        created_by_you: boolean;
        assets: {
            id: string;
            display_filename: string;
            mime: "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm" | "video/quicktime";
            bytes: number;
        }[];
        work_report: {
            status: "accepted" | "draft" | "submitted";
            body: string;
            version: number;
            created_at: string;
            updated_at: string;
            submitted_at: string | null;
            accepted_at: string | null;
            created_by: {
                id: string;
                name: string;
            } | null;
        } | null;
        id: string;
        organization_id: string;
    }>;
};
//# sourceMappingURL=arrangementAssignments.d.ts.map