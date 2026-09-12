import { z } from 'zod';
import type { OrganizationScope } from '../platform/scope.js';
import { createCursorCodec } from '../platform/cursor.js';
import { OrganizationDomainError } from '../organizations/errors.js';
import { hasOrganizationCapability } from '../organizations/roleCapabilities.js';
import type { OrganizationActorContext, OrganizationCapability } from '../organizations/types.js';
import type { ArrangementPropertyRepository, PropertyCollection } from '../arrangements/arrangementPropertyRepository.js';

export const PropertyNameInput = z.object({ name: z.string().trim().min(1).max(200) }).strict();
export const IdempotencyKey = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/u);
const Query = z.object({ limit: z.string().regex(/^[1-9][0-9]{0,2}$/u).transform(Number).refine(n => n <= 100).optional(),
  cursor: z.string().min(1).max(1024).optional() }).strict();
const Association = z.object({ membership_id: z.uuid(), expected_version: z.number().int().positive() }).strict();

export function requireArrangementAuthority(scope: OrganizationScope, actor: OrganizationActorContext,
  ...capabilities: OrganizationCapability[]) {
  if (scope.organization_id !== actor.organization.id || actor.membership.organization_id !== scope.organization_id
    || actor.membership.user_id !== actor.user_id) throw new OrganizationDomainError('NOT_FOUND');
  if (capabilities.some(capability => !hasOrganizationCapability(actor.membership.role, actor.membership.status,
    actor.organization.status, capability))) throw new OrganizationDomainError('FORBIDDEN');
}

export function createArrangementPropertiesService(repository: ArrangementPropertyRepository, environment: NodeJS.ProcessEnv = process.env) {
  return {
    async list(scope: OrganizationScope, actor: OrganizationActorContext, collection: PropertyCollection, propertyId: string | null, raw: unknown) {
      requireArrangementAuthority(scope, actor, ...(collection === 'properties'
        ? ['arrangements.read'] as const : ['arrangements.inquilinos.manage', 'members.read'] as const));
      if (propertyId !== null) z.uuid().parse(propertyId);
      const query = Query.parse(raw);
      const limit = query.limit ?? 25;
      const binding = JSON.stringify(['arrangements', 1, scope.organization_id, collection, propertyId, limit, 'id.asc']);
      const codec = createCursorCodec(environment.PLATFORM_CURSOR_SECRET?.trim() ?? '');
      const after = query.cursor ? codec.decode(query.cursor, binding).id : null;
      const page = await repository.list(scope, { actor_id: actor.membership.id, collection, property_id: propertyId, after_id: after, limit: limit + 1 });
      if (page.organization_id !== scope.organization_id || page.items.length > limit + 1
        || page.items.some((item, index) => (after !== null && item.id <= after)
          || (index > 0 && item.id <= page.items[index - 1]!.id))) throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
      const items = page.items.slice(0, limit);
      return { organization_id: scope.organization_id, items, next_cursor: page.items.length > limit
        ? codec.encode({ id: items.at(-1)!.id, created_at: '1970-01-01T00:00:00Z', filter_fingerprint: binding }) : null };
    },
    async create(scope: OrganizationScope, actor: OrganizationActorContext, body: unknown, key: unknown) {
      requireArrangementAuthority(scope, actor, 'arrangements.properties.create');
      const { name } = PropertyNameInput.parse(body);
      return repository.create(scope, { actor_id: actor.membership.id, name, idempotency_key: IdempotencyKey.parse(key), request_id: actor.request_id });
    },
    async associate(scope: OrganizationScope, actor: OrganizationActorContext, propertyId: string, body: unknown) {
      requireArrangementAuthority(scope, actor, 'arrangements.inquilinos.manage', 'members.manage_member');
      return repository.associate(scope, { actor_id: actor.membership.id, property_id: z.uuid().parse(propertyId),
        ...Association.parse(body), request_id: actor.request_id });
    },
  };
}
