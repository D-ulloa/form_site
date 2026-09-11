import { z } from 'zod';
import { assertRowsInOrganization, type OrganizationScope } from '../platform/scope.js';
import { PlatformError } from '../platform/errors.js';
import { createOrderCursorCodec } from '../arrangements/orderCursor.js';
import type { ArrangementOrderPage, ArrangementOrderRepository } from '../arrangements/types.js';

const Query = z.object({
  status: z.string().min(1).max(64).refine(value => value === value.trim()).optional(),
  limit: z.string().regex(/^[1-9][0-9]{0,2}$/u).transform(Number)
    .refine(value => value <= 100).optional(),
  cursor: z.string().min(1).max(1024).optional(),
}).strict();

export function createListArrangementOrders(
  repository: ArrangementOrderRepository,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return async (scope: OrganizationScope, rawQuery: unknown): Promise<ArrangementOrderPage> => {
    const query = Query.parse(rawQuery);
    const binding = { organization_id: scope.organization_id, status: query.status ?? null, limit: query.limit ?? 25 };
    const codec = createOrderCursorCodec(environment.PLATFORM_CURSOR_SECRET?.trim() ?? '');
    const afterId = query.cursor ? codec.decode(query.cursor, binding) : null;
    const page = await repository.listOpen(scope, { status: binding.status, after_id: afterId, limit: binding.limit });
    assertRowsInOrganization(scope, page.items);
    const ids = page.items.map(item => item.id);
    if (page.organization_id !== scope.organization_id || page.items.length > binding.limit
      || new Set(ids).size !== ids.length
      || page.items.some((item, index) => (afterId !== null && item.id <= afterId)
        || (index > 0 && item.id <= ids[index - 1]!)
        || (binding.status !== null && item.status !== binding.status)
        || !page.available_statuses.includes(item.status))
      || (page.next_after_id !== null && (page.items.length !== binding.limit || page.next_after_id !== ids.at(-1)))) {
      throw new PlatformError('DEPENDENCY_UNAVAILABLE');
    }
    return {
      organization_id: scope.organization_id,
      items: page.items.map(({ id, name, status }) => ({ id, name, status })),
      available_statuses: page.available_statuses,
      next_cursor: page.next_after_id ? codec.encode(page.next_after_id, binding) : null,
    };
  };
}
