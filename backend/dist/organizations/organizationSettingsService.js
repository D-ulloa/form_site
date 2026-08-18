import { OrganizationDomainError } from './errors.js';
import { hasOrganizationCapability } from './roleCapabilities.js';
import { validateBrandColor, validateDisplayName, validateFeatureDefaults, } from './validation.js';
export class OrganizationSettingsService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async get(actor) {
        if (!hasOrganizationCapability(actor.membership.role, actor.membership.status, actor.organization.status, 'organization.update_settings'))
            throw new OrganizationDomainError('FORBIDDEN');
        const settings = await this.repository.get(actor.organization.id);
        if (!settings)
            throw new OrganizationDomainError('NOT_FOUND');
        return settings;
    }
    async update(input, actor) {
        if (!hasOrganizationCapability(actor.membership.role, actor.membership.status, actor.organization.status, 'organization.update_settings'))
            throw new OrganizationDomainError('FORBIDDEN');
        if (input.record_visibility === 'assigned_only')
            throw new OrganizationDomainError('POLICY_NOT_AVAILABLE');
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
    projectPublicBranding(organizationName, settings) {
        return {
            display_name: settings.public_display_name ?? organizationName,
            primary_color: settings.primary_color,
            accent_color: settings.accent_color,
            logo_asset_id: null,
        };
    }
}
//# sourceMappingURL=organizationSettingsService.js.map