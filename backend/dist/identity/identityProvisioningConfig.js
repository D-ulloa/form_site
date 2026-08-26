import { approvedOrigins, IdentityConfigurationError } from './sessionSecurity.js';
import { validateDisplayName, validateLocale, validateTimeZone } from '../organizations/validation.js';
export function identityProvisioningDefaults(environment) {
    return {
        display_name: validateDisplayName(environment.IDENTITY_PROVISIONING_DEFAULT_DISPLAY_NAME?.trim() || 'Usuario invitado'),
        locale: validateLocale(environment.IDENTITY_PROVISIONING_DEFAULT_LOCALE?.trim() || 'es'),
        time_zone: validateTimeZone(environment.IDENTITY_PROVISIONING_DEFAULT_TIME_ZONE?.trim() || 'America/Caracas'),
    };
}
export function validateIdentityProvisioningEnvironment(environment) {
    identityProvisioningDefaults(environment);
    if (environment.NODE_ENV !== 'production')
        return;
    for (const key of ['IDENTITY_PROVISIONING_DEFAULT_DISPLAY_NAME', 'IDENTITY_PROVISIONING_DEFAULT_LOCALE',
        'IDENTITY_PROVISIONING_DEFAULT_TIME_ZONE']) {
        if (!environment[key]?.trim())
            throw new IdentityConfigurationError(`${key} is required in production.`);
    }
    const pepper = environment.IDENTITY_PROVISIONING_EMAIL_PEPPER?.trim();
    if (!pepper || Buffer.byteLength(pepper, 'utf8') < 32) {
        throw new IdentityConfigurationError('IDENTITY_PROVISIONING_EMAIL_PEPPER must contain at least 32 bytes.');
    }
    const redirect = environment.APP_AUTH_ACTIVATION_REDIRECT_URL?.trim();
    if (!redirect || !approvedOrigins(environment).has(new URL(redirect).origin)) {
        throw new IdentityConfigurationError('APP_AUTH_ACTIVATION_REDIRECT_URL must use an allowed production origin.');
    }
    if (!['true', 'false'].includes(environment.IDENTITY_PROVISIONING_ENABLED ?? '')) {
        throw new IdentityConfigurationError('IDENTITY_PROVISIONING_ENABLED must be explicitly true or false.');
    }
}
//# sourceMappingURL=identityProvisioningConfig.js.map