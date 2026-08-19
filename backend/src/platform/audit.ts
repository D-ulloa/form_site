import { PlatformError } from './errors.js';
import { redactTelemetry } from './redaction.js';
import type { OrganizationScope } from './scope.js';

export const AUDIT_ACTOR_TYPES = [
  'member', 'organization_api_key', 'external_contract_link',
  'platform_support', 'system_worker', 'migration',
] as const;
export type AuditActorType = typeof AUDIT_ACTOR_TYPES[number];

export interface AuditActor {
  readonly actor_type: AuditActorType;
  readonly actor_user_id?: string;
  readonly actor_membership_id?: string;
  readonly api_key_id?: string;
  readonly external_capability_id?: string;
  readonly support_session_id?: string;
  readonly support_reason?: string;
}

export interface AuditAppendInput {
  readonly request_id: string;
  readonly actor: AuditActor;
  readonly action: string;
  readonly target_type: string;
  readonly target_id?: string;
  readonly outcome: 'succeeded' | 'denied' | 'failed';
  readonly source: string;
  readonly changed_fields?: readonly string[];
  readonly reason_code?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AuditRepository {
  append(scope: OrganizationScope, input: AuditAppendInput): Promise<void>;
}

function validateAudit(input: AuditAppendInput): AuditAppendInput {
  if (!/^[a-z][a-z0-9_.]{2,127}$/u.test(input.action)
    || !/^[a-z][a-z0-9_]{0,63}$/u.test(input.target_type)
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input.request_id)
    || (input.changed_fields?.length ?? 0) > 64) throw new Error('INVALID_AUDIT_EVENT');
  if (input.actor.actor_type === 'member' && !input.actor.actor_membership_id) throw new Error('INVALID_AUDIT_ACTOR');
  if (input.actor.actor_type === 'platform_support'
    && (!input.actor.support_session_id || !input.actor.support_reason)) throw new Error('INVALID_AUDIT_ACTOR');
  const metadata = redactTelemetry(input.metadata ?? {}) as Readonly<Record<string, unknown>>;
  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 4096) throw new Error('AUDIT_METADATA_TOO_LARGE');
  return { ...input, metadata };
}

export function createAuditService(repository: AuditRepository) {
  return {
    async appendRequired(scope: OrganizationScope, input: AuditAppendInput): Promise<void> {
      try {
        await repository.append(scope, validateAudit(input));
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('INVALID_AUDIT')) throw error;
        throw new PlatformError('AUDIT_UNAVAILABLE');
      }
    },
  };
}
