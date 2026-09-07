import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { SelfServiceOnboardingError, type SelfServiceOnboardingOperation } from './selfServiceOnboardingTypes.js';

export interface SelfServiceOnboardingRepository {
  claim(input: {
    readonly operation_id: string; readonly email_fingerprint: string; readonly payload_fingerprint: string;
    readonly display_name: string; readonly organization_display_name: string; readonly organization_slug: string;
    readonly plan_key: 'standard'; readonly locale: string; readonly time_zone: string; readonly terms_version: string;
    readonly auth_method: 'password' | 'google'; readonly request_id: string;
  }): Promise<SelfServiceOnboardingOperation>;
  markIdentity(operationId: string, userId: string, emailFingerprint: string, authMethod: 'password' | 'google', requestId: string): Promise<SelfServiceOnboardingOperation>;
  reject(operationId: string, reasonCode: string, requestId: string): Promise<void>;
  complete(operationId: string, userId: string, requestId: string): Promise<SelfServiceOnboardingOperation>;
  get(operationId: string, userId: string): Promise<SelfServiceOnboardingOperation>;
}

function row(data: unknown, error: { message: string } | null): SelfServiceOnboardingOperation {
  if (!error && data) return data as SelfServiceOnboardingOperation;
  const message = error?.message ?? '';
  for (const code of ['IDEMPOTENCY_CONFLICT', 'ONBOARDING_IN_PROGRESS', 'FORBIDDEN'] as const) {
    if (message.includes(code)) throw new SelfServiceOnboardingError(code);
  }
  if (message.includes('NOT_FOUND')) throw new SelfServiceOnboardingError('FORBIDDEN');
  throw new SelfServiceOnboardingError('AUTH_DEPENDENCY_UNAVAILABLE');
}

export function createSelfServiceOnboardingRepository(
  environment: NodeJS.ProcessEnv = process.env,
  override?: SupabaseClient,
): SelfServiceOnboardingRepository {
  const client = () => override ?? createPlatformServiceRoleClient(environment);
  return {
    async claim(input) {
      const { data, error } = await client().rpc('spec41_claim_self_service_onboarding', {
        p_operation_id: input.operation_id, p_email_fingerprint: input.email_fingerprint,
        p_payload_fingerprint: input.payload_fingerprint, p_display_name: input.display_name,
        p_organization_display_name: input.organization_display_name, p_organization_slug: input.organization_slug,
        p_plan_key: input.plan_key, p_locale: input.locale, p_time_zone: input.time_zone,
        p_terms_version: input.terms_version, p_auth_method: input.auth_method, p_request_id: input.request_id,
      }).single();
      return row(data, error);
    },
    async markIdentity(operationId, userId, emailFingerprint, authMethod, requestId) {
      const { data, error } = await client().rpc('spec41_mark_self_service_identity', {
        p_operation_id: operationId, p_user_id: userId, p_email_fingerprint: emailFingerprint,
        p_auth_method: authMethod, p_request_id: requestId,
      }).single();
      return row(data, error);
    },
    async reject(operationId, reasonCode, requestId) {
      const { error } = await client().rpc('spec41_reject_self_service_onboarding', {
        p_operation_id: operationId, p_reason_code: reasonCode, p_request_id: requestId,
      });
      if (error) row(null, error);
    },
    async complete(operationId, userId, requestId) {
      const { data, error } = await client().rpc('spec41_complete_self_service_onboarding', {
        p_operation_id: operationId, p_user_id: userId, p_request_id: requestId,
      }).single();
      return row(data, error);
    },
    async get(operationId, userId) {
      const { data, error } = await client().rpc('spec41_get_self_service_onboarding', {
        p_operation_id: operationId, p_user_id: userId,
      }).single();
      return row(data, error);
    },
  };
}
