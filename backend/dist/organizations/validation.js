const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/u;
export const RESERVED_ORGANIZATION_SLUGS = new Set([
    'api', 'app', 'auth', 'admin', 'billing', 'help', 'invitations', 'login', 'logout',
    'new', 'platform', 'register', 'settings', 'status', 'support', 'www',
]);
export class OrganizationValidationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'OrganizationValidationError';
        this.code = code;
    }
}
export function normalizeOrganizationSlug(value) {
    return value.trim().toLowerCase();
}
export function validateOrganizationSlug(value) {
    const slug = normalizeOrganizationSlug(value);
    if (slug.length < 3 || slug.length > 63 || !SLUG_PATTERN.test(slug)) {
        throw new OrganizationValidationError('INVALID_SLUG', 'Organization slug must be 3–63 lowercase letters, digits, or internal hyphens.');
    }
    if (RESERVED_ORGANIZATION_SLUGS.has(slug)) {
        throw new OrganizationValidationError('RESERVED_SLUG', 'Organization slug is reserved.');
    }
    return slug;
}
export function normalizeOrganizationEmail(value) {
    const email = value.trim().normalize('NFKC').toLowerCase();
    if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
        throw new OrganizationValidationError('INVALID_EMAIL', 'A valid email address is required.');
    }
    return email;
}
export function validateLocale(value) {
    const locale = value.trim();
    if (!LOCALE_PATTERN.test(locale))
        throw new OrganizationValidationError('INVALID_LOCALE', 'Locale is invalid.');
    try {
        return Intl.getCanonicalLocales(locale)[0] ?? locale;
    }
    catch {
        throw new OrganizationValidationError('INVALID_LOCALE', 'Locale is invalid.');
    }
}
export function validateTimeZone(value) {
    const timeZone = value.trim();
    try {
        new Intl.DateTimeFormat('en', { timeZone }).format();
        return timeZone;
    }
    catch {
        throw new OrganizationValidationError('INVALID_TIME_ZONE', 'Time zone is invalid.');
    }
}
export function validateDisplayName(value, maximum = 160) {
    const name = value.trim();
    if (name.length === 0 || name.length > maximum) {
        throw new OrganizationValidationError('INVALID_NAME', `Name must contain 1–${maximum} characters.`);
    }
    return name;
}
function relativeLuminance(hex) {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}
export function validateBrandColor(value) {
    if (value === null || value.trim() === '')
        return null;
    const color = value.trim().toUpperCase();
    if (!HEX_COLOR_PATTERN.test(color)) {
        throw new OrganizationValidationError('INVALID_COLOR', 'Brand colors must use #RRGGBB.');
    }
    const luminance = relativeLuminance(color);
    const contrastOnWhite = 1.05 / (luminance + 0.05);
    const contrastOnDark = (luminance + 0.05) / 0.05;
    if (Math.max(contrastOnWhite, contrastOnDark) < 4.5) {
        throw new OrganizationValidationError('INSUFFICIENT_CONTRAST', 'Brand color does not meet WCAG AA contrast.');
    }
    return color;
}
const FEATURE_KEYS = new Set(['default_contract_template', 'property_form_mode']);
export function validateFeatureDefaults(value) {
    for (const key of Object.keys(value)) {
        if (!FEATURE_KEYS.has(key)) {
            throw new OrganizationValidationError('UNKNOWN_FEATURE_DEFAULT', `Unsupported feature default: ${key}.`);
        }
    }
    return Object.freeze({ ...value });
}
//# sourceMappingURL=validation.js.map