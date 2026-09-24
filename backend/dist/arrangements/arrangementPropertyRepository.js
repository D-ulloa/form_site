import { z } from 'zod';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { mapOrganizationPersistenceError, OrganizationDomainError } from '../organizations/errors.js';
export const ArrangementProperty = z.object({ id: z.uuid(), name: z.string().min(1).max(200) }).strict();
export const ArrangementMember = z.object({ id: z.uuid(), display_name: z.string(),
    role: z.enum(['owner', 'admin', 'member', 'viewer', 'inquilino']),
    status: z.enum(['active', 'suspended', 'removed']), version: z.number().int().positive() }).strict();
export const ArrangementInvitation = z.object({ id: z.uuid(), email_masked: z.string(),
    status: z.enum(['pending', 'accepted', 'expired', 'revoked', 'replaced']),
    expires_at: z.string(), version: z.number().int().positive() }).strict();
export function createArrangementPropertyRepository(clientOverride, environment = process.env) {
    async function rpc(scope, name, args) {
        const client = clientOverride ?? createPlatformServiceRoleClient(environment);
        const { data, error } = await client.rpc(name, { p_organization_id: scope.organization_id, ...args });
        if (error)
            mapOrganizationPersistenceError(error);
        if (!data || data.organization_id !== scope.organization_id)
            throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
        return data;
    }
    function parse(schema, data) {
        const result = schema.safeParse(data);
        if (!result.success)
            throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
        return result.data;
    }
    return {
        async list(scope, input) {
            const base = { p_actor_membership_id: input.actor_id, p_after_id: input.after_id, p_limit: input.limit };
            const data = await rpc(scope, input.collection === 'properties' ? 'spec42_list_arrangement_properties' : 'spec42_list_property_people', input.collection === 'properties' ? base : { ...base, p_property_id: input.property_id, p_collection: input.collection });
            const item = input.collection === 'properties' ? ArrangementProperty
                : input.collection === 'invitations' ? ArrangementInvitation : ArrangementMember;
            return parse(z.object({ organization_id: z.uuid(), items: z.array(item).max(101) }).strict(), data);
        },
        async create(scope, input) {
            const data = await rpc(scope, 'spec42_create_arrangement_property', { p_actor_membership_id: input.actor_id,
                p_name: input.name, p_idempotency_key: input.idempotency_key, p_request_id: input.request_id });
            const { id, name } = parse(ArrangementProperty.extend({ organization_id: z.uuid() }), data);
            return { id, name };
        },
        async associate(scope, input) {
            const data = await rpc(scope, 'spec42_associate_inquilino', { p_actor_membership_id: input.actor_id,
                p_property_id: input.property_id, p_membership_id: input.membership_id,
                p_expected_version: input.expected_version, p_request_id: input.request_id });
            const { id, version, arrangement_property_id } = parse(z.object({ organization_id: z.uuid(),
                id: z.uuid(), version: z.number().int().positive(), arrangement_property_id: z.literal(input.property_id) }).strict(), data);
            return { id, version, arrangement_property_id };
        },
    };
}
//# sourceMappingURL=arrangementPropertyRepository.js.map