import type { OrganizationActorContext, OrganizationSettingsRecord, PublicBranding } from './types.js';
export interface OrganizationSettingsRepository {
    get(organizationId: string): Promise<OrganizationSettingsRecord | null>;
    updateAtomic(input: {
        organization_id: string;
        expected_version: number;
        public_display_name: string | null;
        primary_color: string | null;
        accent_color: string | null;
        feature_defaults: Readonly<Record<string, unknown>>;
        actor_membership_id: string;
        request_id: string;
    }): Promise<OrganizationSettingsRecord>;
}
export interface UpdateOrganizationSettingsInput {
    readonly expected_version: number;
    readonly record_visibility: 'organization' | 'assigned_only';
    readonly public_display_name: string | null;
    readonly primary_color: string | null;
    readonly accent_color: string | null;
    readonly feature_defaults: Readonly<Record<string, unknown>>;
}
export declare class OrganizationSettingsService {
    private readonly repository;
    constructor(repository: OrganizationSettingsRepository);
    get(actor: OrganizationActorContext): Promise<OrganizationSettingsRecord>;
    update(input: UpdateOrganizationSettingsInput, actor: OrganizationActorContext): Promise<OrganizationSettingsRecord>;
    projectPublicBranding(organizationName: string, settings: OrganizationSettingsRecord): PublicBranding;
}
//# sourceMappingURL=organizationSettingsService.d.ts.map