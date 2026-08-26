import { type OrganizationProvisioningManifest } from './organizationProvisioningTypes.js';
export declare const ORGANIZATION_PROVISIONING_MANIFEST_MAX_BYTES = 32768;
export declare function manifestFingerprint(manifest: OrganizationProvisioningManifest): string;
export declare function parseOrganizationProvisioningManifest(contents: string): OrganizationProvisioningManifest;
export declare function maskProvisioningEmail(email: string): string;
//# sourceMappingURL=organizationProvisioningManifest.d.ts.map