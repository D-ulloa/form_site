import { type ArrangementRequestRepository } from '../arrangements/requestRepository.js';
import { createAssetRepository } from '../assets/assetRepository.js';
import type { PrivateAssetStorageAdapter } from '../assets/storageAdapter.js';
import type { OrganizationScope } from '../platform/scope.js';
import type { OrganizationActorContext } from '../organizations/types.js';
export declare function createArrangementRequestsService(repository: ArrangementRequestRepository, dependencies: {
    storage: PrivateAssetStorageAdapter;
    detectContent: (bucket: string, path: string) => Promise<{
        detected_mime: string;
        checksum_sha256?: string;
    }>;
    recordUrlIssued?: ReturnType<typeof createAssetRepository>['recordUrlIssued'];
}, environment?: NodeJS.ProcessEnv): {
    list(scope: OrganizationScope, actor: OrganizationActorContext, tenant: boolean, raw: unknown): Promise<{
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
    draft(scope: OrganizationScope, actor: OrganizationActorContext, raw: unknown, key: unknown): Promise<{
        id: string;
        submission_state: "draft" | "submitted";
        status: "rejected" | "open" | "in_progress" | "solved" | "archived";
        version: number;
        upload_session_id?: string | null | undefined;
    }>;
    cancel(scope: OrganizationScope, actor: OrganizationActorContext, orderId: string, raw: unknown): Promise<{
        id: string;
        submission_state: "expired" | "submitted";
    }>;
    submit(scope: OrganizationScope, actor: OrganizationActorContext, orderId: string, raw: unknown): Promise<{
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
    }>;
    status(scope: OrganizationScope, actor: OrganizationActorContext, orderId: string, raw: unknown): Promise<{
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
    }>;
    initialize(scope: OrganizationScope, actor: OrganizationActorContext, orderId: string, raw: unknown, key: unknown): Promise<Readonly<{
        upload_session_id: string;
        expires_at: unknown;
        state: unknown;
        version: unknown;
        uploads: Readonly<{
            asset_id: string;
            upload_intent_id: string;
            upload_url: string;
            required_headers: Readonly<Record<string, string>>;
        }>[];
    }>>;
    finalize(scope: OrganizationScope, actor: OrganizationActorContext, orderId: string, sessionId: string, raw: unknown): Promise<{
        upload_session_id: string;
        state: string;
    }>;
    revoke(scope: OrganizationScope, actor: OrganizationActorContext, orderId: string, sessionId: string, raw: unknown): Promise<{
        upload_session_id: string;
        state: string;
    }>;
    view(scope: OrganizationScope, actor: OrganizationActorContext, tenant: boolean, orderId: string, assetId: string): Promise<{
        readonly signed_url: string;
        readonly expires_at: string;
    }>;
    listAssigned(scope: OrganizationScope, actor: OrganizationActorContext, audience: import("./arrangementAssignments.js").ArrangementAudience, raw: unknown): Promise<{
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
    detail(scope: OrganizationScope, actor: OrganizationActorContext, audience: import("./arrangementAssignments.js").ArrangementAudience, orderId: string): Promise<{
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
    assignedView(scope: OrganizationScope, actor: OrganizationActorContext, audience: import("./arrangementAssignments.js").ArrangementAudience, orderId: string, assetId: string): Promise<{
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
    changes(scope: OrganizationScope, actor: OrganizationActorContext, audience: import("./arrangementAssignments.js").ArrangementAudience): Promise<{
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
//# sourceMappingURL=arrangementRequests.d.ts.map