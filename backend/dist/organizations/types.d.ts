export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';
export type OrganizationStatus = 'active' | 'suspended' | 'pending_deletion' | 'deleted';
export type MembershipStatus = 'active' | 'suspended' | 'removed';
export type RecordVisibility = 'organization' | 'assigned_only';
export type OrganizationCapability = 'organization.read' | 'organization.update_settings' | 'organization.request_deletion' | 'organization.cancel_deletion' | 'organization.export' | 'members.read' | 'members.invite' | 'members.manage_member' | 'members.manage_admin' | 'members.transfer_ownership' | 'contracts.read' | 'contracts.write' | 'contracts.manage' | 'contracts.manage_links' | 'contracts.create' | 'contracts.update' | 'contracts.assign' | 'contracts.change_status' | 'contracts.archive' | 'contracts.view_history' | 'contracts.view_assets' | 'contracts.generate' | 'contract_templates.read' | 'contract_templates.manage' | 'properties.read' | 'properties.write' | 'properties.manage' | 'files.read' | 'integrations.read' | 'integrations.manage' | 'audit.read' | 'billing.read' | 'billing.manage';
export interface OrganizationRecord {
    readonly id: string;
    readonly slug: string;
    readonly display_name: string;
    readonly legal_name: string | null;
    readonly status: OrganizationStatus;
    readonly plan_key: string;
    readonly locale: string;
    readonly time_zone: string;
    readonly creation_source: 'platform' | 'migration' | 'self_service';
    readonly created_by_user_id: string | null;
    readonly status_reason_code: string | null;
    readonly status_changed_at: string;
    readonly created_at: string;
    readonly updated_at: string;
    readonly deleted_at: string | null;
    readonly version: number;
}
export interface OrganizationSettingsRecord {
    readonly organization_id: string;
    readonly record_visibility: RecordVisibility;
    readonly public_display_name: string | null;
    readonly primary_color: string | null;
    readonly accent_color: string | null;
    readonly logo_asset_id: string | null;
    readonly feature_defaults: Readonly<Record<string, unknown>>;
    readonly feature_schema_version: number;
    readonly version: number;
}
export interface OrganizationMembershipRecord {
    readonly id: string;
    readonly organization_id: string;
    readonly user_id: string;
    readonly role: OrganizationRole;
    readonly status: MembershipStatus;
    readonly joined_at: string;
    readonly version: number;
}
export interface OrganizationActorContext {
    readonly request_id: string;
    readonly user_id: string;
    readonly display_name: string;
    readonly organization: OrganizationRecord;
    readonly membership: OrganizationMembershipRecord;
}
export interface PlatformActorContext {
    readonly request_id: string;
    readonly user_id: string;
    readonly actor_type: 'platform_operator';
}
export interface InvitationIdentityContext {
    readonly request_id: string;
    readonly user_id: string;
    readonly verified_email: string;
}
export interface PublicBranding {
    readonly display_name: string;
    readonly primary_color: string | null;
    readonly accent_color: string | null;
    readonly logo_asset_id: string | null;
}
//# sourceMappingURL=types.d.ts.map