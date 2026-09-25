import { z } from 'zod';
import { createCursorCodec } from '../platform/cursor.js';
import { OrganizationDomainError } from '../organizations/errors.js';
import { hasOrganizationCapability } from '../organizations/roleCapabilities.js';
import { parseSearch, searchMatches } from '../arrangements/searchText.js';
export const PropertyNameInput = z.object({ name: z.string().trim().min(1).max(200) }).strict();
export const IdempotencyKey = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/u);
const Query = z.object({ limit: z.string().regex(/^[1-9][0-9]{0,2}$/u).transform(Number).refine(n => n <= 100).optional(),
    cursor: z.string().min(1).max(1024).optional(), search: z.unknown().optional() }).strict();
const Association = z.object({ membership_id: z.uuid(), expected_version: z.number().int().positive() }).strict();
/** Scan source pages until enough name matches; never filters only the last fetched page. */
const MAX_SOURCE_PAGES = 50;
function isNamedItem(item) {
    return typeof item.name === 'string';
}
export function requireArrangementAuthority(scope, actor, ...capabilities) {
    if (scope.organization_id !== actor.organization.id || actor.membership.organization_id !== scope.organization_id
        || actor.membership.user_id !== actor.user_id)
        throw new OrganizationDomainError('NOT_FOUND');
    if (capabilities.some(capability => !hasOrganizationCapability(actor.membership.role, actor.membership.status, actor.organization.status, capability)))
        throw new OrganizationDomainError('FORBIDDEN');
}
export function createArrangementPropertiesService(repository, environment = process.env) {
    return {
        async list(scope, actor, collection, propertyId, raw) {
            requireArrangementAuthority(scope, actor, ...(collection === 'properties'
                ? ['arrangements.read'] : ['arrangements.inquilinos.manage', 'members.read']));
            if (propertyId !== null)
                z.uuid().parse(propertyId);
            const query = Query.parse(raw);
            const limit = query.limit ?? 25;
            const search = collection === 'properties' ? parseSearch(query.search) : null;
            if (collection !== 'properties' && query.search !== undefined && query.search !== null && query.search !== '') {
                throw new OrganizationDomainError('FORBIDDEN');
            }
            const binding = JSON.stringify(['arrangements', 2, scope.organization_id, collection, propertyId, limit, 'id.asc', search]);
            const codec = createCursorCodec(environment.PLATFORM_CURSOR_SECRET?.trim() ?? '');
            const after = query.cursor ? codec.decode(query.cursor, binding).id : null;
            let items;
            let nextAfter = null;
            if (!search) {
                const page = await repository.list(scope, { actor_id: actor.membership.id, collection, property_id: propertyId, after_id: after, limit: limit + 1 });
                if (page.organization_id !== scope.organization_id || page.items.length > limit + 1
                    || page.items.some((item, index) => (after !== null && item.id <= after)
                        || (index > 0 && item.id <= page.items[index - 1].id)))
                    throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
                items = page.items.slice(0, limit);
                nextAfter = page.items.length > limit ? { id: items.at(-1).id } : null;
            }
            else {
                const matched = [];
                let cursor = after;
                let sourceExhausted = false;
                const chunkSize = 100;
                for (let page = 0; page < MAX_SOURCE_PAGES && matched.length <= limit; page += 1) {
                    const chunk = await repository.list(scope, { actor_id: actor.membership.id, collection, property_id: propertyId, after_id: cursor, limit: chunkSize });
                    if (chunk.organization_id !== scope.organization_id || chunk.items.length > chunkSize
                        || chunk.items.some((item, index) => (cursor !== null && item.id <= cursor)
                            || (index > 0 && item.id <= chunk.items[index - 1].id)))
                        throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
                    if (chunk.items.length === 0) {
                        sourceExhausted = true;
                        break;
                    }
                    for (const item of chunk.items) {
                        if (isNamedItem(item) && searchMatches(item.name, search))
                            matched.push(item);
                        cursor = item.id;
                    }
                    if (chunk.items.length < chunkSize) {
                        sourceExhausted = true;
                        break;
                    }
                }
                if (!sourceExhausted && matched.length <= limit)
                    throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
                items = matched.slice(0, limit);
                nextAfter = matched.length > limit && items.length > 0 ? { id: items.at(-1).id } : null;
            }
            return { organization_id: scope.organization_id, items, next_cursor: nextAfter
                    ? codec.encode({ id: nextAfter.id, created_at: '1970-01-01T00:00:00Z', filter_fingerprint: binding }) : null };
        },
        async create(scope, actor, body, key) {
            requireArrangementAuthority(scope, actor, 'arrangements.properties.create');
            const { name } = PropertyNameInput.parse(body);
            return repository.create(scope, { actor_id: actor.membership.id, name, idempotency_key: IdempotencyKey.parse(key), request_id: actor.request_id });
        },
        async associate(scope, actor, propertyId, body) {
            requireArrangementAuthority(scope, actor, 'arrangements.inquilinos.manage', 'members.manage_member');
            return repository.associate(scope, { actor_id: actor.membership.id, property_id: z.uuid().parse(propertyId),
                ...Association.parse(body), request_id: actor.request_id });
        },
    };
}
//# sourceMappingURL=arrangementProperties.js.map