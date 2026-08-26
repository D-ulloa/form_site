import { createHash, createHmac, randomUUID } from 'node:crypto';
import { identityProvisioningDefaults } from './identityProvisioningConfig.js';
import { IdentityProviderAmbiguousError, IdentityProviderUnavailableError } from './supabaseAdminAdapter.js';
import { IdentityProvisioningError } from './identityProvisioningTypes.js';
import { normalizeOrganizationEmail, validateDisplayName, validateLocale, validateTimeZone, } from '../organizations/validation.js';
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u;
function stableFingerprint(value) {
    const canonical = Object.keys(value).sort().map((key) => `${key}\u001f${value[key] ?? ''}`).join('\u001e');
    return createHash('sha256').update(canonical).digest('hex');
}
function result(operation, email, idempotencyOverride) {
    if (!operation.outcome)
        throw new IdentityProvisioningError('AUDIT_UNAVAILABLE');
    return {
        user_id: operation.auth_user_id,
        email_normalized: email,
        outcome: operation.outcome,
        profile_state: operation.profile_state,
        activation_required: operation.activation_required ?? false,
        provider_reconciliation_reference: operation.provider_reconciliation_reference,
        idempotency: idempotencyOverride ?? (operation.claim_state === 'replayed' ? 'replayed'
            : operation.claim_state === 'resumed' ? 'resumed' : 'created'),
    };
}
export class IdentityProvisioningService {
    repository;
    admin;
    environment;
    constructor(repository, admin, environment = process.env) {
        this.repository = repository;
        this.admin = admin;
        this.environment = environment;
    }
    async provision(input, actor) {
        if (this.environment.IDENTITY_PROVISIONING_ENABLED !== 'true') {
            throw new IdentityProvisioningError('PROVISIONING_DISABLED');
        }
        if (!REQUEST_ID.test(input.request_id) || !IDEMPOTENCY_KEY.test(input.idempotency_key)) {
            throw new IdentityProvisioningError('IDEMPOTENCY_CONFLICT');
        }
        await this.repository.assertActor(actor, input.purpose);
        const defaults = identityProvisioningDefaults(this.environment);
        const email = normalizeOrganizationEmail(input.email);
        const displayName = validateDisplayName(input.display_name ?? defaults.display_name);
        const locale = validateLocale(input.locale ?? defaults.locale);
        const timeZone = validateTimeZone(input.time_zone ?? defaults.time_zone);
        const pepper = this.environment.IDENTITY_PROVISIONING_EMAIL_PEPPER?.trim();
        if (!pepper || Buffer.byteLength(pepper, 'utf8') < 32)
            throw new IdentityProvisioningError('PROVISIONING_DISABLED');
        const emailFingerprint = createHmac('sha256', pepper).update(email).digest('hex');
        const payloadFingerprint = stableFingerprint({ email, displayName, locale, timeZone, purpose: input.purpose });
        const operation = await this.repository.claim({
            idempotency_key: input.idempotency_key,
            payload_fingerprint: payloadFingerprint,
            email_fingerprint: emailFingerprint,
            purpose: input.purpose,
            request_id: input.request_id,
            actor,
        });
        if (operation.claim_state === 'busy')
            throw new IdentityProvisioningError('PROVISIONING_IN_PROGRESS');
        if (operation.claim_state === 'replayed')
            return result(operation, email);
        if (operation.claim_state === 'blocked_inventory') {
            const blocked = await this.repository.block({ operation_id: operation.operation_id,
                outcome: 'blocked_ambiguous', reason_code: 'IDENTITY_AMBIGUOUS', request_id: input.request_id,
                reconciliation_reference: randomUUID() });
            return result(blocked, email, 'created');
        }
        const reconciliationReference = randomUUID();
        let matches;
        try {
            matches = await this.admin.resolveByEmail(email);
        }
        catch (error) {
            await this.repository.markProviderAmbiguous(operation.operation_id, 'resolve', input.request_id);
            if (error instanceof IdentityProviderAmbiguousError) {
                const blocked = await this.repository.block({ operation_id: operation.operation_id,
                    outcome: 'blocked_ambiguous', reason_code: 'IDENTITY_AMBIGUOUS', request_id: input.request_id,
                    reconciliation_reference: reconciliationReference });
                return result(blocked, email, operation.claim_state === 'resumed' ? 'resumed' : 'created');
            }
            throw new IdentityProvisioningError('IDENTITY_PROVIDER_UNAVAILABLE');
        }
        if (matches.length > 1) {
            const blocked = await this.repository.block({ operation_id: operation.operation_id,
                outcome: 'blocked_ambiguous', reason_code: 'IDENTITY_AMBIGUOUS', request_id: input.request_id,
                reconciliation_reference: reconciliationReference });
            return result(blocked, email, operation.claim_state === 'resumed' ? 'resumed' : 'created');
        }
        let user = matches[0];
        let outcome;
        if (user) {
            if (!user.eligible) {
                const blocked = await this.repository.block({ operation_id: operation.operation_id,
                    outcome: 'blocked_ineligible', reason_code: 'IDENTITY_INELIGIBLE', request_id: input.request_id,
                    reconciliation_reference: reconciliationReference });
                return result(blocked, email, operation.claim_state === 'resumed' ? 'resumed' : 'created');
            }
            outcome = operation.state === 'provider_ambiguous' ? 'reconciled_after_ambiguity'
                : user.activation_required ? 'existing_activation_required' : 'existing_active';
        }
        else {
            if (operation.state === 'provider_ambiguous' && operation.provider_ambiguity_phase === 'create') {
                throw new IdentityProvisioningError('IDENTITY_PROVIDER_UNAVAILABLE');
            }
            try {
                user = await this.admin.createInviteOnly(email);
                if (user.email_normalized !== email)
                    throw new IdentityProviderAmbiguousError();
                outcome = 'created_activation_required';
            }
            catch (error) {
                await this.repository.markProviderAmbiguous(operation.operation_id, 'create', input.request_id);
                if (!(error instanceof IdentityProviderAmbiguousError || error instanceof IdentityProviderUnavailableError)) {
                    throw new IdentityProvisioningError('IDENTITY_PROVIDER_UNAVAILABLE');
                }
                try {
                    const reconciled = await this.admin.resolveByEmail(email);
                    if (reconciled.length > 1) {
                        const blocked = await this.repository.block({ operation_id: operation.operation_id,
                            outcome: 'blocked_ambiguous', reason_code: 'IDENTITY_AMBIGUOUS', request_id: input.request_id,
                            reconciliation_reference: reconciliationReference });
                        return result(blocked, email, operation.claim_state === 'resumed' ? 'resumed' : 'created');
                    }
                    if (reconciled.length === 0)
                        throw new IdentityProvisioningError('IDENTITY_PROVIDER_UNAVAILABLE');
                    [user] = reconciled;
                    if (!user?.eligible) {
                        const blocked = await this.repository.block({ operation_id: operation.operation_id,
                            outcome: 'blocked_ineligible', reason_code: 'IDENTITY_INELIGIBLE', request_id: input.request_id,
                            reconciliation_reference: reconciliationReference });
                        return result(blocked, email, operation.claim_state === 'resumed' ? 'resumed' : 'created');
                    }
                    outcome = 'reconciled_after_ambiguity';
                }
                catch (reconciliationError) {
                    if (reconciliationError instanceof IdentityProvisioningError)
                        throw reconciliationError;
                    throw new IdentityProvisioningError('IDENTITY_PROVIDER_UNAVAILABLE');
                }
            }
        }
        if (!user)
            throw new IdentityProvisioningError('IDENTITY_PROVIDER_UNAVAILABLE');
        if (user.email_normalized !== email) {
            const blocked = await this.repository.block({ operation_id: operation.operation_id,
                outcome: 'blocked_ambiguous', reason_code: 'IDENTITY_AMBIGUOUS', request_id: input.request_id,
                reconciliation_reference: reconciliationReference });
            return result(blocked, email, operation.claim_state === 'resumed' ? 'resumed' : 'created');
        }
        if (!user.eligible || (outcome === 'created_activation_required' && !user.activation_required)) {
            const blocked = await this.repository.block({ operation_id: operation.operation_id,
                outcome: 'blocked_ineligible', reason_code: 'IDENTITY_INELIGIBLE', request_id: input.request_id,
                reconciliation_reference: reconciliationReference });
            return result(blocked, email, operation.claim_state === 'resumed' ? 'resumed' : 'created');
        }
        const completed = await this.repository.complete({ operation_id: operation.operation_id, user_id: user.id,
            display_name: displayName, locale, time_zone: timeZone, outcome,
            activation_required: user.activation_required, reconciliation_reference: reconciliationReference,
            request_id: input.request_id });
        return result(completed, email, operation.claim_state === 'resumed' ? 'resumed' : 'created');
    }
}
//# sourceMappingURL=identityProvisioningService.js.map