import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { assertRowsInOrganization } from '../platform/scope.js';
import { PlatformError } from '../platform/errors.js';
import type { ArrangementOrderRepository } from './types.js';

const Status = z.string().min(1).max(64).refine(value => value === value.trim());
const Page = z.object({
  organization_id: z.uuid(),
  items: z.array(z.object({
    id: z.uuid(), organization_id: z.uuid(), name: z.string().min(1).max(200), status: Status,
  }).strict()).max(100),
  available_statuses: z.array(Status),
  next_after_id: z.uuid().nullable(),
}).strict();

export function createArrangementOrderRepository(
  clientOverride?: SupabaseClient,
  environment: NodeJS.ProcessEnv = process.env,
): ArrangementOrderRepository {
  return {
    async listOpen(scope, query) {
      const client = clientOverride ?? createPlatformServiceRoleClient(environment);
      const { data, error } = await client.rpc('spec39_list_arrangement_orders', {
        p_organization_id: scope.organization_id, p_status: query.status,
        p_after_id: query.after_id, p_limit: query.limit,
      });
      const parsed = Page.safeParse(data);
      if (error || !parsed.success || parsed.data.organization_id !== scope.organization_id) {
        throw new PlatformError('DEPENDENCY_UNAVAILABLE');
      }
      assertRowsInOrganization(scope, parsed.data.items);
      return parsed.data;
    },
  };
}
