import type { OrganizationRequestContext } from './types.js';
/** Minimal browser projection. Organization records contain administrative metadata. */
export declare function publicOrganizationContext(context: OrganizationRequestContext): {
    organization: {
        id: string;
        slug: string;
        display_name: string;
        status: import("../organizations/types.js").OrganizationStatus;
    };
    membership: {
        id: string;
        organization_id: string;
        user_id: string;
        role: import("../organizations/types.js").OrganizationRole;
        status: import("../organizations/types.js").MembershipStatus;
        version: number;
        arrangement_property_id: string | null;
    };
    capabilities: import("../organizations/types.js").OrganizationCapability[];
    home_destination: string | null;
    context_epoch_hint: string;
};
//# sourceMappingURL=organizationHome.d.ts.map