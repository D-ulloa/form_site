import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditAppendInput, AuditRepository } from './audit.js';
import type { DistributedRateLimitStore, RateLimitDecision } from './rateLimit.js';
import type { OrganizationScope } from './scope.js';
import { createPlatformServiceRoleClient } from './serviceRoleClient.js';
import type { UsageEventInput, UsageEventRecord, UsageRepository } from './usage.js';

function requireNoError(error: { message: string } | null): void {
  if (error) throw new Error('PLATFORM_DATABASE_OPERATION_FAILED');
}

export function createPlatformRepository(
  clientOverride?: SupabaseClient,
  environment: NodeJS.ProcessEnv = process.env,
): AuditRepository & DistributedRateLimitStore & UsageRepository {
  const client = () => clientOverride ?? createPlatformServiceRoleClient(environment);
  return {
    async append(scope: OrganizationScope, input: AuditAppendInput): Promise<void> {
      const { error } = await client().from('audit_events').insert({
        organization_id: scope.organization_id,
        request_id: input.request_id,
        ...input.actor,
        action: input.action,
        target_type: input.target_type,
        target_id: input.target_id ?? null,
        outcome: input.outcome,
        source: input.source,
        changed_fields: input.changed_fields ?? [],
        reason_code: input.reason_code ?? null,
        metadata: input.metadata ?? {},
      });
      requireNoError(error);
    },

    async consume(input): Promise<RateLimitDecision> {
      const shared = {
        p_policy_key: input.policy_key,
        p_subject_hash: `\\x${input.subject_hash}`,
        p_window_seconds: input.window_seconds,
        p_limit: input.limit,
        p_cost: input.cost,
        p_now: input.now.toISOString(),
      };
      const rpc = input.scope
        ? client().rpc('spec28_consume_organization_rate_limit', {
          p_organization_id: input.scope.organization_id, ...shared,
        })
        : client().rpc('spec28_consume_platform_rate_limit', shared);
      const { data, error } = await rpc.single();
      requireNoError(error);
      if (!data || typeof data !== 'object') throw new Error('INVALID_LIMITER_RESPONSE');
      return data as unknown as RateLimitDecision;
    },

    async record(scope: OrganizationScope, input: UsageEventInput): Promise<UsageEventRecord> {
      const { data, error } = await client().rpc('spec28_record_usage', {
        p_organization_id: scope.organization_id,
        p_idempotency_key: input.idempotency_key,
        p_metric_key: input.metric_key,
        p_quantity: input.quantity,
        p_unit: input.unit,
        p_source_type: input.source_type,
        p_source_id: input.source_id ?? null,
        p_actor_type: input.actor_type,
        p_request_id: input.request_id,
        p_metadata: input.metadata ?? {},
      }).single();
      requireNoError(error);
      if (!data || (data as { organization_id?: unknown }).organization_id !== scope.organization_id) {
        throw new Error('ORGANIZATION_SCOPE_MISMATCH');
      }
      return data as unknown as UsageEventRecord;
    },
  };
}
