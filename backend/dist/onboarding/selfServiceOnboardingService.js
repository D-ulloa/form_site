import { createHash, createHmac, randomUUID } from 'node:crypto';
import { normalizeOrganizationEmail, validateDisplayName, validateLocale, validateOrganizationSlug, validateTimeZone } from '../organizations/validation.js';
import { SelfServiceOnboardingError, } from './selfServiceOnboardingTypes.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PASSWORD_MINIMUM_LENGTH = 12;
function requestId(value) {
    return value && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(value)
        ? value : `signup:${randomUUID()}`;
}
function slugify(value) {
    const base = value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 52);
    return base || 'organizacion';
}
function operationPayload(input, email) {
    return createHash('sha256').update([
        email, input.full_name.trim(), input.organization_name.trim(), input.auth_method,
    ].join('\u001f')).digest('hex');
}
export class SelfServiceOnboardingService {
    repository;
    identities;
    environment;
    constructor(repository, identities, environment = process.env) {
        this.repository = repository;
        this.identities = identities;
        this.environment = environment;
    }
    defaults() {
        const pepper = this.environment.SELF_SERVICE_ONBOARDING_EMAIL_PEPPER?.trim()
            ?? this.environment.IDENTITY_PROVISIONING_EMAIL_PEPPER?.trim();
        if (!pepper || Buffer.byteLength(pepper, 'utf8') < 32)
            throw new SelfServiceOnboardingError('REGISTRATION_DISABLED');
        return {
            pepper,
            locale: validateLocale(this.environment.SELF_SERVICE_ONBOARDING_DEFAULT_LOCALE?.trim() || 'es'),
            time_zone: validateTimeZone(this.environment.SELF_SERVICE_ONBOARDING_DEFAULT_TIME_ZONE?.trim() || 'America/Caracas'),
            terms_version: this.environment.SELF_SERVICE_TERMS_VERSION?.trim() || 'v1',
        };
    }
    assertEnabled() {
        if (this.environment.SELF_SERVICE_REGISTRATION_ENABLED !== 'true') {
            throw new SelfServiceOnboardingError('REGISTRATION_DISABLED');
        }
    }
    async claim(input, incomingRequestId) {
        this.assertEnabled();
        if (!UUID.test(input.operation_id) || input.terms_accepted !== true)
            throw new SelfServiceOnboardingError('INVALID_REQUEST');
        const email = normalizeOrganizationEmail(input.email);
        const displayName = validateDisplayName(input.full_name);
        const organizationName = validateDisplayName(input.organization_name);
        const defaults = this.defaults();
        const digest = createHmac('sha256', defaults.pepper).update(email).digest('hex');
        const suffix = input.operation_id.replace(/-/gu, '').slice(0, 8);
        const slug = validateOrganizationSlug(`${slugify(organizationName).slice(0, 54)}-${suffix}`);
        return {
            email,
            operation: await this.repository.claim({
                operation_id: input.operation_id, email_fingerprint: digest, payload_fingerprint: operationPayload(input, email),
                display_name: displayName, organization_display_name: organizationName, organization_slug: slug,
                plan_key: 'standard', locale: defaults.locale, time_zone: defaults.time_zone, terms_version: defaults.terms_version,
                auth_method: input.auth_method, request_id: requestId(incomingRequestId),
            }),
        };
    }
    async establish(operation, identity, incomingRequestId) {
        const id = requestId(incomingRequestId);
        const pepper = this.defaults().pepper;
        const emailFingerprint = createHmac('sha256', pepper).update(normalizeOrganizationEmail(identity.email)).digest('hex');
        const marked = operation.auth_user_id ? operation : await this.repository.markIdentity(operation.operation_id, identity.user_id, emailFingerprint, identity.auth_method === 'google' ? 'google' : 'password', id);
        if (marked.auth_user_id !== identity.user_id)
            throw new SelfServiceOnboardingError('FORBIDDEN');
        const completed = await this.repository.complete(marked.operation_id, identity.user_id, id);
        if (completed.state !== 'completed')
            throw new SelfServiceOnboardingError('ONBOARDING_RECOVERY_REQUIRED');
        return completed;
    }
    async registerPassword(input, incomingRequestId) {
        if (input.password !== input.password_confirmation || input.password.length < PASSWORD_MINIMUM_LENGTH || input.password.length > 1024) {
            throw new SelfServiceOnboardingError('INVALID_REQUEST');
        }
        const claimed = await this.claim(input, incomingRequestId);
        if (claimed.operation.state === 'rejected')
            throw new SelfServiceOnboardingError('EXISTING_ACCOUNT');
        // A completed operation with this exact payload is a lost-response replay,
        // not a new attempt by an existing account. Recreate its normal app session.
        let matches;
        try {
            matches = await this.identities.resolveByEmail(claimed.email);
        }
        catch {
            throw new SelfServiceOnboardingError('AUTH_DEPENDENCY_UNAVAILABLE');
        }
        if (matches.length > 1) {
            await this.repository.reject(claimed.operation.operation_id, 'EXISTING_ACCOUNT', requestId(incomingRequestId));
            throw new SelfServiceOnboardingError('EXISTING_ACCOUNT');
        }
        if (matches.length === 1 && claimed.operation.auth_user_id === null && claimed.operation.claim_state === 'created') {
            await this.repository.reject(claimed.operation.operation_id, 'EXISTING_ACCOUNT', requestId(incomingRequestId));
            throw new SelfServiceOnboardingError('EXISTING_ACCOUNT');
        }
        let identity;
        try {
            identity = claimed.operation.auth_user_id
                ? await this.identities.sessionIdentity(claimed.operation.auth_user_id, 'password')
                : matches[0]
                    ? await this.identities.sessionIdentity(matches[0].id, 'password')
                    : await this.identities.createPassword(claimed.email, input.password, input.full_name.trim());
        }
        catch {
            try {
                const reconciled = await this.identities.resolveByEmail(claimed.email);
                if (reconciled.length === 1 && reconciled[0]?.id === claimed.operation.auth_user_id) {
                    identity = await this.identities.sessionIdentity(reconciled[0].id, 'password');
                }
                else
                    throw new SelfServiceOnboardingError('AUTH_DEPENDENCY_UNAVAILABLE');
            }
            catch (error) {
                if (error instanceof SelfServiceOnboardingError)
                    throw error;
                throw new SelfServiceOnboardingError('AUTH_DEPENDENCY_UNAVAILABLE');
            }
        }
        return { identity, operation: await this.establish(claimed.operation, identity, incomingRequestId) };
    }
    async startGoogle(input, incomingRequestId) {
        const claimed = await this.claim(input, incomingRequestId);
        if (claimed.operation.state === 'rejected')
            throw new SelfServiceOnboardingError('EXISTING_ACCOUNT');
        try {
            const matches = await this.identities.resolveByEmail(claimed.email);
            if (matches.length > 0 && claimed.operation.claim_state === 'created') {
                await this.repository.reject(claimed.operation.operation_id, 'EXISTING_ACCOUNT', requestId(incomingRequestId));
                throw new SelfServiceOnboardingError('EXISTING_ACCOUNT');
            }
        }
        catch (error) {
            if (error instanceof SelfServiceOnboardingError)
                throw error;
            throw new SelfServiceOnboardingError('AUTH_DEPENDENCY_UNAVAILABLE');
        }
        return claimed.operation;
    }
    async completeGoogle(operationId, identity, incomingRequestId) {
        this.assertEnabled();
        if (!UUID.test(operationId))
            throw new SelfServiceOnboardingError('INVALID_REQUEST');
        const operation = await this.repository.get(operationId, identity.user_id).catch(async (error) => {
            if (!(error instanceof SelfServiceOnboardingError) || error.code !== 'FORBIDDEN')
                throw error;
            // The authenticated Google identity is bound on its first callback only.
            return null;
        });
        if (operation)
            return { identity, operation: await this.establish(operation, identity, incomingRequestId) };
        // The operation is intentionally not discoverable by user ID before the callback.
        // Marking it binds a randomly generated, pre-OAuth intent to this exact Google identity.
        const emailFingerprint = createHmac('sha256', this.defaults().pepper)
            .update(normalizeOrganizationEmail(identity.email)).digest('hex');
        const bound = await this.repository.markIdentity(operationId, identity.user_id, emailFingerprint, 'google', requestId(incomingRequestId));
        return { identity, operation: await this.establish(bound, identity, incomingRequestId) };
    }
    async recover(operationId, identity, incomingRequestId) {
        this.assertEnabled();
        const operation = await this.repository.get(operationId, identity.user_id);
        return { identity, operation: await this.establish(operation, identity, incomingRequestId) };
    }
}
//# sourceMappingURL=selfServiceOnboardingService.js.map