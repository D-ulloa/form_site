import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { assertProviderScope } from './providerGuards.js';
import { validateWebhookDestination } from './webhookSecurity.js';
function isLegacyMakeEnvelope(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const envelope = value;
    return envelope.type === 'UPDATE' && envelope.table === 'contract_entries'
        && envelope.schema === 'public' && !!envelope.record && typeof envelope.record === 'object'
        && !Array.isArray(envelope.record);
}
export function createContractGenerationPayloadLoader(client) {
    return {
        async load(organizationId, entryId) {
            const { data, error } = await client.rpc('spec38_contract_generation_make_payload', {
                p_organization_id: organizationId,
                p_entry_id: entryId,
            });
            if (error) {
                if (error.message === 'NOT_FOUND')
                    return null;
                throw new Error('CONTRACT_GENERATION_PAYLOAD_UNAVAILABLE');
            }
            if (!isLegacyMakeEnvelope(data))
                throw new Error('INVALID_CONTRACT_GENERATION_PAYLOAD');
            return data;
        },
    };
}
function entryId(delivery) {
    const value = delivery.event.data.entry_id;
    return typeof value === 'string' && value.length > 0 ? value : null;
}
function endpoint(context, environment) {
    const value = context.configuration.endpoint_origin;
    if (value === 'shared://make')
        return environment.MAKE_CONTRACT_GENERATION_WEBHOOK_URL?.trim() || null;
    return typeof value === 'string' && value.length > 0 ? value : null;
}
function postAndAcknowledge(destination, headers, body) {
    return new Promise((resolve, reject) => {
        const request = httpsRequest(destination, {
            method: 'POST',
            headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
        }, (response) => {
            response.resume();
            clearTimeout(deadline);
            resolve(response.statusCode ?? 0);
        });
        const deadline = setTimeout(() => request.destroy(new Error('MAKE_TIMEOUT')), 10_000);
        request.once('error', (error) => { clearTimeout(deadline); reject(error); });
        request.end(body);
    });
}
export function createMakeWebhookAdapter(dependencies) {
    const resolve = dependencies.resolve ?? (async (hostname) => (await lookup(hostname, { all: true })).map((address) => address.address));
    const poster = dependencies.poster ?? { post: postAndAcknowledge };
    return {
        async deliver(context, delivery) {
            try {
                assertProviderScope(context, delivery);
                if (context.provider !== 'make_webhook' || context.purpose !== 'contract_generation'
                    || delivery.event.event_type !== 'contract.generation.requested') {
                    return { kind: 'permanent_failure', error_code: 'UNSUPPORTED_MAKE_EVENT' };
                }
                const target = endpoint(context, dependencies.environment ?? process.env);
                const contractEntryId = entryId(delivery);
                if (!target)
                    return { kind: 'permanent_failure', error_code: 'CONTRACT_MAKE_WEBHOOK_URL_NOT_CONFIGURED' };
                if (!contractEntryId)
                    return { kind: 'permanent_failure', error_code: 'INVALID_MAKE_DELIVERY' };
                const payload = await dependencies.payloads.load(delivery.organization_id, contractEntryId);
                if (!payload)
                    return { kind: 'permanent_failure', error_code: 'CONTRACT_ENTRY_NOT_FOUND' };
                const destination = await validateWebhookDestination(target, resolve);
                const status = await poster.post(destination, {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': delivery.idempotency_key,
                    'X-Event-Id': delivery.event.event_id,
                    'X-Organization-Id': delivery.organization_id,
                }, JSON.stringify(payload));
                if (status < 200 || status >= 300) {
                    // A timeout/server error cannot prove that Make did not accept the event.
                    return status >= 400 && status < 500 && status !== 408 && status !== 429
                        ? { kind: 'permanent_failure', error_code: 'MAKE_DELIVERY_REJECTED' }
                        : { kind: 'ambiguous', error_code: 'MAKE_DELIVERY_UNKNOWN' };
                }
                return { kind: 'succeeded', external_id: delivery.id };
            }
            catch (error) {
                if (error instanceof Error && /INTEGRATION_SCOPE_MISMATCH|UNSAFE_DESTINATION/u.test(error.message)) {
                    return { kind: 'permanent_failure', error_code: 'INVALID_MAKE_DELIVERY' };
                }
                return { kind: 'ambiguous', error_code: 'MAKE_DELIVERY_UNKNOWN' };
            }
        },
        async reconcile(_context, _delivery) {
            // Make's incoming webhooks do not provide a lookup API for a submitted event.
            return { kind: 'ambiguous', error_code: 'MAKE_RECONCILIATION_UNSUPPORTED' };
        },
    };
}
export function isContractGenerationEnvelope(event) {
    return event.event_type === 'contract.generation.requested'
        && typeof event.data.entry_id === 'string';
}
//# sourceMappingURL=makeWebhookAdapter.js.map