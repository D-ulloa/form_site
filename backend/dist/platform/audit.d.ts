import type { OrganizationScope } from './scope.js';
export declare const AUDIT_ACTOR_TYPES: readonly ["member", "organization_api_key", "external_contract_link", "platform_support", "system_worker", "migration"];
export type AuditActorType = typeof AUDIT_ACTOR_TYPES[number];
export interface AuditActor {
    readonly actor_type: AuditActorType;
    readonly actor_user_id?: string;
    readonly actor_membership_id?: string;
    readonly api_key_id?: string;
    readonly external_capability_id?: string;
    readonly support_session_id?: string;
    readonly support_reason?: string;
}
export interface AuditAppendInput {
    readonly request_id: string;
    readonly actor: AuditActor;
    readonly action: string;
    readonly target_type: string;
    readonly target_id?: string;
    readonly outcome: 'succeeded' | 'denied' | 'failed';
    readonly source: string;
    readonly changed_fields?: readonly string[];
    readonly reason_code?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface AuditRepository {
    append(scope: OrganizationScope, input: AuditAppendInput): Promise<void>;
}
export declare function createAuditService(repository: AuditRepository): {
    appendRequired(scope: OrganizationScope, input: AuditAppendInput): Promise<void>;
};
//# sourceMappingURL=audit.d.ts.map