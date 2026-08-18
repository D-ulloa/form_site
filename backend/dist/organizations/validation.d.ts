export declare const RESERVED_ORGANIZATION_SLUGS: Set<string>;
export declare class OrganizationValidationError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function normalizeOrganizationSlug(value: string): string;
export declare function validateOrganizationSlug(value: string): string;
export declare function normalizeOrganizationEmail(value: string): string;
export declare function validateLocale(value: string): string;
export declare function validateTimeZone(value: string): string;
export declare function validateDisplayName(value: string, maximum?: number): string;
export declare function validateBrandColor(value: string | null): string | null;
export declare function validateFeatureDefaults(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
//# sourceMappingURL=validation.d.ts.map