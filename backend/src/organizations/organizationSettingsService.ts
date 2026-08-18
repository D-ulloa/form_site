import { OrganizationDomainError } from './errors.js';
import { hasOrganizationCapability } from './roleCapabilities.js';
import type { OrganizationActorContext, OrganizationSettingsRecord, PublicBranding } from './types.js';
import {
  validateBrandColor,
  validateDisplayName,
  validateFeatureDefaults,
} from './validation.js';

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

export class OrganizationSettingsService {
  constructor(private readonly repository: OrganizationSettingsRepository) {}

  async get(actor: OrganizationActorContext): Promise<OrganizationSettingsRecord> {
    if (!hasOrganizationCapability(
      actor.membership.role, actor.membership.status, actor.organization.status, 'organization.update_settings',
    )) throw new OrganizationDomainError('FORBIDDEN');
    const settings = await this.repository.get(actor.organization.id);
    if (!settings) throw new OrganizationDomainError('NOT_FOUND');
    return settings;
  }

  async update(input: UpdateOrganizationSettingsInput, actor: OrganizationActorContext): Promise<OrganizationSettingsRecord> {
    if (!hasOrganizationCapability(
      actor.membership.role, actor.membership.status, actor.organization.status, 'organization.update_settings',
    )) throw new OrganizationDomainError('FORBIDDEN');
    if (input.record_visibility === 'assigned_only') throw new OrganizationDomainError('POLICY_NOT_AVAILABLE');
    if (input.record_visibility !== 'organization' || !Number.isInteger(input.expected_version) || input.expected_version < 1) {
      throw new OrganizationDomainError('FORBIDDEN', 'Settings version or visibility is invalid.');
    }
    return this.repository.updateAtomic({
      organization_id: actor.organization.id,
      expected_version: input.expected_version,
      public_display_name: input.public_display_name ? validateDisplayName(input.public_display_name) : null,
      primary_color: validateBrandColor(input.primary_color),
      accent_color: validateBrandColor(input.accent_color),
      feature_defaults: validateFeatureDefaults(input.feature_defaults),
      actor_membership_id: actor.membership.id,
      request_id: actor.request_id,
    });
  }

  projectPublicBranding(
    organizationName: string,
    settings: OrganizationSettingsRecord,
  ): PublicBranding {
    return {
      display_name: settings.public_display_name ?? organizationName,
      primary_color: settings.primary_color,
      accent_color: settings.accent_color,
      logo_asset_id: null,
    };
  }
}
