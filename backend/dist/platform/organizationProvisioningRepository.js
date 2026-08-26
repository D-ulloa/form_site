import { createPlatformServiceRoleClient } from './serviceRoleClient.js';
import { OrganizationProvisioningError } from './organizationProvisioningTypes.js';
function mapError(error, data) {
    const message = error?.message ?? (!data ? 'AUDIT_UNAVAILABLE' : '');
    for (const code of ['IDEMPOTENCY_CONFLICT', 'FORBIDDEN', 'APPROVAL_REQUIRED', 'SLUG_CONFLICT', 'MIGRATION_INVENTORY_CONFLICT',
        'READBACK_FAILED', 'NOT_FOUND']) {
        if (message.includes(code))
            throw new OrganizationProvisioningError(code);
    }
    throw new OrganizationProvisioningError('AUDIT_UNAVAILABLE');
}
function requireRow(data, error) {
    if (error || !data)
        mapError(error, data);
    return data;
}
export function createOrganizationProvisioningRepository(environment = process.env, clientOverride) {
    const client = clientOverride ?? createPlatformServiceRoleClient(environment);
    return {
        async preflight(input) {
            const { data, error } = await client.rpc('spec36_preflight_organization_provisioning', {
                p_operator_user_id: input.manifest.requested_by_operator_user_id,
                p_step_up_session_id: input.step_up_session_id,
                p_operation_id: input.manifest.operation_id,
                p_slug: input.manifest.organization.slug,
            }).single();
            return requireRow(data, error);
        },
        async claim(input) {
            const manifest = input.manifest;
            const { data, error } = await client.rpc('spec36_claim_organization_provisioning', {
                p_operation_id: manifest.operation_id,
                p_manifest_fingerprint: input.manifest_fingerprint,
                p_requested_at: manifest.requested_at,
                p_operator_user_id: manifest.requested_by_operator_user_id,
                p_step_up_session_id: input.step_up_session_id,
                p_approval_reference: manifest.approval_reference,
                p_operator_owner_equality_approved: manifest.operator_owner_identity_equality_approved === true,
                p_deployment_identity: input.deployment_identity,
                p_target_project_ref: input.target_project_ref,
                p_slug: manifest.organization.slug,
                p_display_name: manifest.organization.display_name,
                p_legal_name: manifest.organization.legal_name,
                p_plan_key: manifest.organization.plan_key,
                p_locale: manifest.organization.locale,
                p_time_zone: manifest.organization.time_zone,
                p_owner_email_fingerprint: input.owner_email_fingerprint,
                p_owner_display_name: manifest.initial_owner.display_name,
                p_owner_locale: manifest.initial_owner.locale,
                p_owner_time_zone: manifest.initial_owner.time_zone,
                p_request_id: input.request_id,
            }).single();
            return requireRow(data, error);
        },
        async complete(input) {
            const { data, error } = await client.rpc('spec36_complete_organization_provisioning', {
                p_operation_id: input.operation_id, p_manifest_fingerprint: input.manifest_fingerprint,
                p_owner_user_id: input.owner_user_id, p_activation_required: input.activation_required,
                p_request_id: input.request_id,
            }).single();
            return requireRow(data, error);
        },
        async get(operationId) {
            const { data, error } = await client.rpc('spec36_get_organization_provisioning', {
                p_operation_id: operationId,
            }).single();
            return requireRow(data, error);
        },
    };
}
//# sourceMappingURL=organizationProvisioningRepository.js.map