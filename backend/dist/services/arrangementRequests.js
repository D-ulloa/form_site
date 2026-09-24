import { createArrangementAssignmentsService } from './arrangementAssignments.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createRequestCursorCodec } from '../arrangements/requestCursor.js';
import { ArrangementStatus, RequestRecord, ArrangementRequestError } from '../arrangements/requestRepository.js';
import { createAssetService } from '../assets/assetService.js';
import { createAssetRepository } from '../assets/assetRepository.js';
import { createAssetReceiverRegistry, validateAssetUploadBatch } from '../assets/receiverPolicy.js';
import { PlatformError } from '../platform/errors.js';
import { IdempotencyKey, requireArrangementAuthority } from './arrangementProperties.js';
function parseResponse(schema, value) {
    const result = schema.safeParse(value);
    if (!result.success)
        throw new PlatformError('DEPENDENCY_UNAVAILABLE');
    return result.data;
}
const Query = z.object({ status: ArrangementStatus.optional(), limit: z.string().regex(/^[1-9][0-9]{0,2}$/u).transform(Number).refine(n => n <= 100).optional(), cursor: z.string().min(1).max(1024).optional() }).strict();
const Descriptor = z.object({ receiver_key: z.enum(['arrangement.image', 'arrangement.video']), original_filename: z.string().trim().min(1).max(256), declared_mime: z.string(), declared_bytes: z.number().int().positive(), checksum_sha256: z.string().regex(/^[0-9a-f]{64}$/u) }).strict();
const Session = z.object({ id: z.uuid(), organization_id: z.uuid(), state: z.string(), expires_at: z.string(), version: z.number().int().positive() }).passthrough();
const Intent = z.object({ id: z.uuid(), organization_id: z.uuid(), asset_id: z.uuid(), receiver_key: z.string(), bucket_name: z.string(), object_path: z.string(), state: z.string() }).passthrough();
const Batch = z.object({ session: Session, intents: z.array(Intent).min(1).max(40), assets: z.array(z.object({ id: z.uuid(), organization_id: z.uuid() }).passthrough()).min(1).max(40) });
export function createArrangementRequestsService(repository, dependencies, environment = process.env) {
    function authorize(scope, actor, tenant, write = false) {
        requireArrangementAuthority(scope, actor, tenant ? (write ? 'inquilino.arrangements.create' : 'inquilino.arrangements.read') : (write ? 'arrangements.status.update' : 'arrangements.read'));
        if (tenant && !actor.membership.arrangement_property_id)
            throw new ArrangementRequestError('PROPERTY_REQUIRED', 409);
    }
    const call = (scope, actor, action, input) => repository.call(scope, actor, action, input);
    async function batch(scope, actor, orderId, sessionId) {
        const data = parseResponse(Batch, await call(scope, actor, 'tenant.session_context', { order_id: orderId, session_id: sessionId }));
        if (data.session.organization_id !== scope.organization_id || [...data.intents, ...data.assets].some(row => row.organization_id !== scope.organization_id))
            throw new PlatformError('DEPENDENCY_UNAVAILABLE');
        return data;
    }
    function assets(scope, actor, orderId) {
        const context = { scope, principal: { type: 'member', reference_id: actor.membership.id,
                fingerprint: createHash('sha256').update(actor.membership.id).digest('hex') }, capabilities: new Set(['inquilino.arrangements.create']), request_id: actor.request_id };
        let currentBatch;
        const service = createAssetService({
            storage: dependencies.storage, detectContent: dependencies.detectContent,
            authorizeOwner: async () => { authorize(scope, actor, true, true); return true; },
            reserveQuota: async () => { },
            registry: createAssetReceiverRegistry(environment),
            repository: {
                initialize: async (_scope, input) => parseResponse(Session, await call(scope, actor, 'tenant.session_initialize', { order_id: orderId, idempotency_key: input.idempotency_key, descriptors: input.descriptors })),
                listSessionIntents: async (_scope, sessionId) => { currentBatch = await batch(scope, actor, orderId, sessionId); return currentBatch.intents; },
                findInternal: async (_scope, assetId) => currentBatch?.assets.find(row => row.id === assetId) ?? null,
                recordUrlIssued: dependencies.recordUrlIssued ?? createAssetRepository(undefined, environment).recordUrlIssued,
                finalize: async (_scope, input) => parseResponse(Session, await call(scope, actor, 'tenant.session_finalize', { order_id: orderId,
                    session_id: input.p_upload_session_id, expected_version: input.p_expected_version, objects: input.p_verified_objects })),
            },
        });
        return { context, service };
    }
    return {
        ...createArrangementAssignmentsService(repository, dependencies.storage, environment),
        async list(scope, actor, tenant, raw) {
            authorize(scope, actor, tenant);
            const query = Query.parse(raw);
            const binding = { organization_id: scope.organization_id, property_id: tenant ? actor.membership.arrangement_property_id : null, status: query.status ?? null, limit: query.limit ?? 25 };
            const codec = createRequestCursorCodec(environment.PLATFORM_CURSOR_SECRET ?? '', binding);
            const after = query.cursor ? codec.decode(query.cursor) : null;
            const page = parseResponse(z.object({ organization_id: z.uuid(), property_id: z.uuid().nullable(), items: z.array(RequestRecord).max(101) }).strict(), await call(scope, actor, tenant ? 'tenant.list' : 'internal.list', {
                status: binding.status, limit: binding.limit, after_id: after?.id ?? null, after_at: after?.at ?? null,
            }));
            if (page.items.length > binding.limit + 1 || new Set(page.items.map(item => item.id)).size !== page.items.length || page.organization_id !== scope.organization_id || page.property_id !== binding.property_id || page.items.some(item => item.organization_id !== scope.organization_id || (binding.status && item.status !== binding.status)
                || (tenant && (item.legacy || item.property?.id !== binding.property_id))))
                throw new PlatformError('DEPENDENCY_UNAVAILABLE');
            const items = page.items.slice(0, binding.limit);
            const last = items.at(-1);
            return { organization_id: scope.organization_id, items, available_statuses: ArrangementStatus.options,
                next_cursor: page.items.length > binding.limit && last ? codec.encode({ id: last.id, at: last.submitted_at }) : null };
        },
        async draft(scope, actor, raw, key) {
            authorize(scope, actor, true, true);
            const body = z.object({ description: z.string().trim().min(1).max(5000) }).strict().parse(raw);
            return parseResponse(z.object({ id: z.uuid(), submission_state: z.enum(['draft', 'submitted']), status: ArrangementStatus, version: z.number().int().positive(), upload_session_id: z.uuid().nullable().optional() }).strict(), await call(scope, actor, 'tenant.draft', { ...body, idempotency_key: IdempotencyKey.parse(key) }));
        },
        async cancel(scope, actor, orderId, raw) {
            authorize(scope, actor, true, true);
            z.object({}).strict().parse(raw);
            return parseResponse(z.object({ id: z.uuid(), submission_state: z.enum(['expired', 'submitted']) }).strict(), await call(scope, actor, 'tenant.cancel', { order_id: z.uuid().parse(orderId) }));
        },
        async submit(scope, actor, orderId, raw) {
            authorize(scope, actor, true, true);
            z.object({}).strict().parse(raw);
            return parseResponse(RequestRecord, await call(scope, actor, 'tenant.submit', { order_id: z.uuid().parse(orderId) }));
        },
        async status(scope, actor, orderId, raw) {
            authorize(scope, actor, false, true);
            const body = z.object({ status: ArrangementStatus, expected_version: z.number().int().positive().max(2147483647) }).strict().parse(raw);
            return parseResponse(RequestRecord, await call(scope, actor, 'internal.status', { order_id: z.uuid().parse(orderId), ...body }));
        },
        async initialize(scope, actor, orderId, raw, key) {
            authorize(scope, actor, true, true);
            z.uuid().parse(orderId);
            const body = z.object({ files: z.array(Descriptor).min(1).max(40) }).strict().parse(raw);
            try {
                validateAssetUploadBatch(body.files, 'member', createAssetReceiverRegistry(environment));
                if (body.files.reduce((total, file) => total + file.declared_bytes, 0) > 1024 ** 3)
                    throw new Error();
            }
            catch {
                throw new ArrangementRequestError('UPLOAD_INVALID', 400);
            }
            const { context, service } = assets(scope, actor, orderId);
            return service.initialize(context, { owner_type: 'arrangement_order', owner_id: orderId, capability_key: 'inquilino.arrangements.create',
                idempotency_key: IdempotencyKey.parse(key), expires_at: new Date(Date.now() + 55 * 60_000).toISOString(), descriptors: body.files });
        },
        async finalize(scope, actor, orderId, sessionId, raw) {
            authorize(scope, actor, true, true);
            z.uuid().parse(orderId);
            z.uuid().parse(sessionId);
            z.object({}).strict().parse(raw);
            const data = await batch(scope, actor, orderId, sessionId);
            if (data.session.state === 'consumed')
                return { upload_session_id: sessionId, state: 'consumed' };
            const { context, service } = assets(scope, actor, orderId);
            try {
                await service.finalize(context, { upload_session_id: sessionId, expected_version: data.session.version, asset_ids: data.intents.map(intent => intent.asset_id) });
            }
            catch (error) {
                if (error instanceof Error && ['ASSET_METADATA_MISMATCH', 'ASSET_NOT_FOUND'].includes(error.message))
                    throw new ArrangementRequestError('UPLOAD_INVALID', 400);
                throw error;
            }
            return { upload_session_id: sessionId, state: 'consumed' };
        },
        async revoke(scope, actor, orderId, sessionId, raw) {
            authorize(scope, actor, true, true);
            z.object({}).strict().parse(raw);
            await call(scope, actor, 'tenant.session_revoke', { order_id: z.uuid().parse(orderId), session_id: z.uuid().parse(sessionId) });
            return { upload_session_id: sessionId, state: 'revoked' };
        },
        async view(scope, actor, tenant, orderId, assetId) {
            authorize(scope, actor, tenant);
            const record = parseResponse(z.object({ id: z.uuid(), organization_id: z.uuid(), state: z.literal('attached'), bucket_name: z.literal('arrangement-media'), object_path: z.string(), display_filename: z.string() }).passthrough(), await call(scope, actor, tenant ? 'tenant.view' : 'internal.view', { order_id: z.uuid().parse(orderId), asset_id: z.uuid().parse(assetId) }));
            if (record.organization_id !== scope.organization_id || record.id !== assetId)
                throw new PlatformError('DEPENDENCY_UNAVAILABLE');
            return dependencies.storage.issueView(record.bucket_name, record.object_path, 60, record.display_filename);
        },
    };
}
//# sourceMappingURL=arrangementRequests.js.map