export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';
export type MembershipStatus = 'active' | 'suspended' | 'removed';
export type OrganizationCapability =
  | 'organization.read'
  | 'organization.update_settings'
  | 'organization.request_deletion'
  | 'organization.cancel_deletion'
  | 'organization.export'
  | 'members.read'
  | 'members.invite'
  | 'members.manage_member'
  | 'members.manage_admin'
  | 'members.transfer_ownership';

export interface OrganizationContextSummary {
  readonly organization_id: string;
  readonly organization_slug: string;
  readonly display_name: string;
  readonly status: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
  readonly plan_key: string;
  readonly role: OrganizationRole;
  readonly capabilities: readonly OrganizationCapability[];
}

export interface OrganizationMemberSummary {
  readonly user_id: string;
  readonly display_name: string;
  readonly email_masked: string;
  readonly role: OrganizationRole;
  readonly status: MembershipStatus;
  readonly joined_at: string;
  readonly version: number;
}

export interface OrganizationInvitationSummary {
  readonly invitation_id: string;
  readonly email_masked: string;
  readonly intended_role: Exclude<OrganizationRole, 'owner'>;
  readonly status: 'pending' | 'accepted' | 'revoked' | 'replaced' | 'expired';
  readonly expires_at: string;
  readonly delivery_state: 'pending' | 'accepted_by_provider' | 'delivered' | 'failed' | 'bounced' | 'complained';
  readonly delivery_method: 'share_link' | 'email';
  readonly link_issued_at: string | null;
  readonly last_attempt_at: string | null;
  readonly attempt_count: number;
  readonly next_action: 'rotate_or_revoke' | 'resend_or_revoke' | 'none';
  readonly version: number;
}

export interface ManualInvitationReceipt {
  readonly invitation_id: string;
  readonly status: string;
  readonly delivery_state: string;
  readonly delivery_method: 'share_link';
  readonly expires_at: string;
  readonly next_action: 'copy_or_revoke';
  readonly share_url: string;
}

export interface InvitationResolution {
  readonly organization_display_name: string;
  readonly email_masked: string;
  readonly intended_role: Exclude<OrganizationRole, 'owner'>;
  readonly expires_at: string;
}
