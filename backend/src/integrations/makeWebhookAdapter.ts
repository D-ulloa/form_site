import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { assertProviderScope } from './providerGuards.js';
import type { IntegrationExecutionContext, LeasedDelivery, OutboxEnvelope, ProviderOutcome } from './types.js';
import { validateWebhookDestination } from './webhookSecurity.js';

export interface LegacyMakeEnvelope {
  readonly type: 'UPDATE';
  readonly table: 'contract_entries';
  readonly schema: 'public';
  readonly record: Readonly<Record<string, unknown>>;
}

export interface ContractGenerationPayloadLoader {
  load(organizationId: string, entryId: string): Promise<LegacyMakeEnvelope | null>;
}

export interface RpcClient {
  rpc(functionName: string, parameters: Readonly<Record<string, unknown>>): PromiseLike<{
    readonly data: unknown;
    readonly error: { readonly message: string } | null;
  }>;
}

function isLegacyMakeEnvelope(value: unknown): value is LegacyMakeEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  return envelope.type === 'UPDATE' && envelope.table === 'contract_entries'
    && envelope.schema === 'public' && !!envelope.record && typeof envelope.record === 'object'
    && !Array.isArray(envelope.record);
}

export function createContractGenerationPayloadLoader(client: RpcClient): ContractGenerationPayloadLoader {
  return {
    async load(organizationId, entryId) {
      const { data, error } = await client.rpc('spec38_contract_generation_make_payload', {
        p_organization_id: organizationId,
        p_entry_id: entryId,
      });
      if (error) {
        if (error.message === 'NOT_FOUND') return null;
        throw new Error('CONTRACT_GENERATION_PAYLOAD_UNAVAILABLE');
      }
      if (!isLegacyMakeEnvelope(data)) throw new Error('INVALID_CONTRACT_GENERATION_PAYLOAD');
      return data;
    },
  };
}

function entryId(delivery: LeasedDelivery): string | null {
  const value = delivery.event.data.entry_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function endpoint(context: IntegrationExecutionContext): string | null {
  const value = context.configuration.endpoint_origin;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export interface FireAndForgetWebhookPoster {
  post(destination: URL, headers: Readonly<Record<string, string>>, body: string): void;
}

function postWithoutWaiting(destination: URL, headers: Readonly<Record<string, string>>, body: string): void {
  const request = httpsRequest(destination, {
    method: 'POST',
    headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
  }, (response) => {
    // The request has already been recorded as sent. Discard any Make response.
    response.resume();
  });
  // A connection failure after request.end() cannot be reflected in this
  // fire-and-forget contract, but the listener prevents an unhandled error.
  request.once('error', () => undefined);
  request.end(body);
}

export function createMakeWebhookAdapter(dependencies: {
  readonly payloads: ContractGenerationPayloadLoader;
  readonly resolve?: (hostname: string) => Promise<readonly string[]>;
  readonly poster?: FireAndForgetWebhookPoster;
}) {
  const resolve = dependencies.resolve ?? (async (hostname: string) =>
    (await lookup(hostname, { all: true })).map((address) => address.address));
  const poster = dependencies.poster ?? { post: postWithoutWaiting };

  return {
    async deliver(context: IntegrationExecutionContext, delivery: LeasedDelivery): Promise<ProviderOutcome> {
      try {
        assertProviderScope(context, delivery);
        if (context.provider !== 'make_webhook' || context.purpose !== 'contract_generation'
          || delivery.event.event_type !== 'contract.generation.requested') {
          return { kind: 'permanent_failure', error_code: 'UNSUPPORTED_MAKE_EVENT' };
        }
        const target = endpoint(context);
        const contractEntryId = entryId(delivery);
        if (!target || !contractEntryId) return { kind: 'permanent_failure', error_code: 'INVALID_MAKE_DELIVERY' };

        const payload = await dependencies.payloads.load(delivery.organization_id, contractEntryId);
        if (!payload) return { kind: 'permanent_failure', error_code: 'CONTRACT_ENTRY_NOT_FOUND' };

        const destination = await validateWebhookDestination(target, resolve);
        poster.post(destination, {
          'Content-Type': 'application/json',
          'Idempotency-Key': delivery.idempotency_key,
          'X-Event-Id': delivery.event.event_id,
          'X-Organization-Id': delivery.organization_id,
        }, JSON.stringify(payload));
        return { kind: 'succeeded', external_id: delivery.id };
      } catch (error) {
        if (error instanceof Error && /INTEGRATION_SCOPE_MISMATCH|UNSAFE_DESTINATION/u.test(error.message)) {
          return { kind: 'permanent_failure', error_code: 'INVALID_MAKE_DELIVERY' };
        }
        return { kind: 'ambiguous', error_code: 'MAKE_DELIVERY_UNKNOWN' };
      }
    },

    async reconcile(_context: IntegrationExecutionContext, _delivery: LeasedDelivery): Promise<ProviderOutcome> {
      // Make's incoming webhooks do not provide a lookup API for a submitted event.
      return { kind: 'ambiguous', error_code: 'MAKE_RECONCILIATION_UNSUPPORTED' };
    },
  };
}

export function isContractGenerationEnvelope(event: OutboxEnvelope): boolean {
  return event.event_type === 'contract.generation.requested'
    && typeof event.data.entry_id === 'string';
}
