import type { SupabaseClient } from '@supabase/supabase-js';
import { createOrganizationScope } from '../platform/scope.js';
import type { DeliveryState, IntegrationExecutionContext, LeasedDelivery, OutboxEnvelope, ProviderOutcome } from './types.js';
import type { DeliveryRepository } from './worker.js';

type Row = Readonly<Record<string, unknown>>;

function object(value: unknown): Row | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function eventFrom(value: unknown): OutboxEnvelope | null {
  const row = object(value);
  const data = object(row?.data);
  const eventId = text(row?.event_id); const eventType = text(row?.event_type);
  const organizationReference = text(row?.organization_reference); const resourceId = text(row?.resource_id);
  const resourceVersion = integer(row?.resource_version); const occurredAt = text(row?.occurred_at);
  const idempotencyKey = text(row?.idempotency_key);
  if (!row || !data || !eventId || !eventType || row.schema_version !== '1' || !organizationReference
    || !resourceId || resourceVersion === null || !occurredAt || !idempotencyKey) return null;
  return { event_id: eventId, event_type: eventType, schema_version: '1', organization_reference: organizationReference,
    resource_id: resourceId, resource_version: resourceVersion, occurred_at: occurredAt,
    idempotency_key: idempotencyKey, data };
}

function deliveryFrom(value: unknown): LeasedDelivery {
  const row = object(value); const event = eventFrom(row?.event);
  const id = text(row?.id); const organizationId = text(row?.organization_id); const outboxEventId = text(row?.outbox_event_id);
  const integrationId = text(row?.integration_id); const leaseToken = text(row?.lease_token);
  const leaseExpiresAt = text(row?.lease_expires_at); const idempotencyKey = text(row?.idempotency_key);
  const attemptCount = integer(row?.attempt_count); const version = integer(row?.version);
  if (!row || !event || !id || !organizationId || !outboxEventId || !integrationId || row.provider !== 'make_webhook'
    || row.purpose !== 'contract_generation' || row.state !== 'leased' || !leaseToken || !leaseExpiresAt
    || !idempotencyKey || attemptCount === null || version === null) throw new Error('INVALID_LEASED_DELIVERY');
  return { id, organization_id: organizationId, outbox_event_id: outboxEventId, integration_id: integrationId,
    provider: 'make_webhook', purpose: 'contract_generation', state: 'leased', lease_token: leaseToken,
    lease_expires_at: leaseExpiresAt, attempt_count: attemptCount, idempotency_key: idempotencyKey, version, event };
}

function outcomeFields(outcome: ProviderOutcome): { readonly error: string | null; readonly externalId: string | null; readonly receipt: string | null } {
  if (outcome.kind === 'succeeded') return { error: null, externalId: outcome.external_id, receipt: outcome.receipt_reference ?? null };
  return { error: outcome.error_code, externalId: null, receipt: null };
}

/** Supabase adapter for the SPEC-38 contract-generation Make worker. */
export function createSupabaseContractMakeDeliveryRepository(client: SupabaseClient): DeliveryRepository {
  const processingVersions = new Map<string, number>();

  async function transition(delivery: LeasedDelivery, expectedVersion: number, nextState: DeliveryState,
    safeErrorCode: string | null, externalId: string | null, receiptReference: string | null,
    nextAttemptAt: string | null): Promise<number> {
    const { data, error } = await client.rpc('spec32_transition_delivery', {
      p_organization_id: delivery.organization_id, p_delivery_id: delivery.id, p_lease_token: delivery.lease_token,
      p_expected_version: expectedVersion, p_next_state: nextState, p_safe_error_code: safeErrorCode,
      p_external_id: externalId, p_receipt_reference: receiptReference, p_next_attempt_at: nextAttemptAt,
    });
    const row = Array.isArray(data) ? object(data[0]) : object(data);
    const version = integer(row?.version);
    if (error || version === null) throw new Error('DELIVERY_TRANSITION_FAILED');
    return version;
  }

  return {
    async claim(workerId, limit, leaseSeconds) {
      const { data, error } = await client.rpc('spec38_claim_contract_generation_deliveries', {
        p_worker_id: workerId, p_limit: limit, p_lease_seconds: leaseSeconds,
      });
      if (error || !Array.isArray(data)) throw new Error('DELIVERY_CLAIM_FAILED');
      return data.map(deliveryFrom);
    },

    async resolveExecutionContext(delivery) {
      const { data, error } = await client.from('organization_integrations')
        .select('id, organization_id, provider, purpose, state, credential_version, configuration_version, configuration')
        .eq('id', delivery.integration_id).eq('organization_id', delivery.organization_id)
        .eq('provider', 'make_webhook').eq('purpose', 'contract_generation').eq('state', 'active').maybeSingle();
      const row = object(data); const configuration = object(row?.configuration);
      const credentialVersion = integer(row?.credential_version) ?? 0;
      const configurationVersion = integer(row?.configuration_version);
      if (error || !row || !configuration || configurationVersion === null) return null;
      return { scope: createOrganizationScope(delivery.organization_id), integration_id: delivery.integration_id,
        provider: 'make_webhook', purpose: 'contract_generation', configuration_version: configurationVersion,
        credential_version: credentialVersion, configuration } satisfies IntegrationExecutionContext;
    },

    async start(delivery) {
      processingVersions.set(delivery.id, await transition(delivery, delivery.version, 'processing', null, null, null, null));
    },

    async finish(delivery, outcome, decision, nextAttemptAt) {
      const fields = outcomeFields(outcome); const version = processingVersions.get(delivery.id);
      if (version === undefined) throw new Error('DELIVERY_NOT_STARTED');
      try {
        await transition(delivery, version, decision, fields.error, fields.externalId, fields.receipt, nextAttemptAt);
      } finally {
        processingVersions.delete(delivery.id);
      }
    },

    async abandon(delivery, safeErrorCode) {
      await transition(delivery, delivery.version, 'blocked', safeErrorCode, null, null, null);
    },
  };
}
