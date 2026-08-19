import type { OrganizationScope } from '../platform/scope.js';
export type ContractActor = {
    readonly actor_type: 'member';
    readonly actor_user_id: string;
    readonly actor_membership_id: string;
} | {
    readonly actor_type: 'organization_api_key';
    readonly api_key_id: string;
} | {
    readonly actor_type: 'external_contract_link';
    readonly external_capability_id: string;
} | {
    readonly actor_type: 'platform_support';
    readonly support_session_id: string;
    readonly support_reason: string;
} | {
    readonly actor_type: 'system_worker' | 'migration';
};
export interface OrganizationRequestContext {
    readonly scope: OrganizationScope;
    readonly request_id: string;
    readonly context_epoch: number;
    readonly user_id: string;
    readonly membership_id: string;
    readonly role: 'owner' | 'admin' | 'member' | 'viewer';
    readonly record_visibility: 'organization' | 'assigned_only';
    readonly capabilities: ReadonlySet<string>;
}
export interface ContractLinkContext {
    readonly scope: OrganizationScope;
    readonly request_id: string;
    readonly link_id: string;
    readonly entry_id: string;
    readonly role: 'user' | 'client';
    readonly allowed_operations: ReadonlySet<'read' | 'submit' | 'upload' | 'view_asset'>;
    readonly expires_at: string;
}
export declare function requireContractCapability(context: OrganizationRequestContext, capability: string): void;
export declare function canSeeContract(context: OrganizationRequestContext, entry: {
    readonly organization_id: string;
    readonly assigned_to_user_id: string | null;
}): boolean;
export declare function assertExpectedVersion(actual: number, expected: number): void;
declare const STATUS_TRANSITIONS: Readonly<{
    open: Set<string>;
    complete: Set<string>;
    generar_contrato: Set<string>;
    archived: Set<string>;
}>;
export type ContractAggregateStatus = keyof typeof STATUS_TRANSITIONS;
export declare function assertContractStatusTransition(current: ContractAggregateStatus, next: ContractAggregateStatus): void;
export interface GeneratedContractLinkToken {
    readonly raw_token: string;
    readonly token_hash: string;
    readonly token_prefix: string;
    readonly fingerprint: string;
}
export declare function createContractLinkToken(pepper: string): GeneratedContractLinkToken;
export declare function contractLinkTokenMatches(rawToken: string, expectedHash: string, pepper: string): boolean;
export declare function assertActiveLink(link: {
    readonly status: string;
    readonly expires_at: string;
    readonly role: string;
    readonly allowed_operations: readonly string[];
}, role: 'user' | 'client', operation: string, now?: Date): void;
export declare const PLATFORM_CONTRACT_BRANDING: Readonly<{
    display_name: "Portal de contratos";
    primary_color: "#1F2937";
    accent_color: "#2563EB";
    logo_asset_id: null;
}>;
export interface PublicContractBranding {
    readonly display_name: string;
    readonly primary_color: string;
    readonly accent_color: string;
    readonly logo_asset_id: string | null;
}
export declare function projectPublicContractBranding(settings: {
    readonly public_display_name?: string | null;
    readonly primary_color?: string | null;
    readonly accent_color?: string | null;
    readonly logo_asset_id?: string | null;
} | null): PublicContractBranding;
export declare function validateContractTemplateDefinition(value: unknown): Readonly<Record<string, unknown>>;
export {};
//# sourceMappingURL=multiTenantDomain.d.ts.map