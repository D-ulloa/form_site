import { arrangementAudience, arrangementReadCapability } from '../services/arrangementAssignments.js';
import { Router } from 'express';
import { z } from 'zod';
import { IdentityAccessError } from '../identity/sessionSecurity.js';
import { OrganizationDomainError } from '../organizations/errors.js';
import { createTenantMutationSecurity } from './identity.js';
import { createOrganizationScope } from '../platform/scope.js';
import { safeErrorEnvelope } from '../platform/errors.js';
import { createDistributedRateLimiter } from '../platform/rateLimit.js';
import { createPlatformRepository } from '../platform/platformRepository.js';
import { createArrangementRequestRepository, ArrangementRequestError } from '../arrangements/requestRepository.js';
import { createArrangementRequestsService } from '../services/arrangementRequests.js';
import { createSupabaseAssetStorageAdapter } from '../assets/storageAdapter.js';
import { createAssetContentDetector } from '../assets/contentDetector.js';
export function createArrangementRequestsRouter(sessions, environment, dependencies = {}, legacyList = false) {
    const router = Router({ mergeParams: true });
    const service = dependencies.requests ?? createArrangementRequestsService(createArrangementRequestRepository(undefined, environment), {
        storage: createSupabaseAssetStorageAdapter(undefined, environment), detectContent: createAssetContentDetector(undefined, environment),
    }, environment);
    const secureMutation = createTenantMutationSecurity(sessions, environment);
    async function actor(request, capability, policy, touch = true) {
        const context = await sessions.context(request, String(request.params.organization ?? ''), capability, touch);
        const scope = createOrganizationScope(context.organization.id);
        const limiter = dependencies.limiter ?? createDistributedRateLimiter(createPlatformRepository(undefined, environment), environment.PLATFORM_RATE_LIMIT_PEPPER ?? '');
        await limiter.consume({ scope, policy_key: policy, principal_type: context.principal_type, principal_id: context.membership.id });
        return { scope, context };
    }
    function fail(response, caught) {
        if (caught instanceof ArrangementRequestError)
            response.status(caught.status).json({ error: caught.code, ...(caught.current ? { current: caught.current } : {}) });
        else if (caught instanceof OrganizationDomainError)
            response.status(caught.http_status).json({ error: caught.code });
        else if (caught instanceof IdentityAccessError)
            response.status(caught.status).json({ error: caught.code });
        else if (caught instanceof z.ZodError)
            response.status(400).json({ error: 'INVALID_REQUEST' });
        else {
            const safe = safeErrorEnvelope(caught, String(response.locals.request_id ?? ''));
            if (safe.retry_after_seconds)
                response.set('Retry-After', String(safe.retry_after_seconds));
            response.status(safe.status).json(safe.body);
        }
    }
    for (const tenant of [false, true]) {
        const prefix = tenant ? '/inquilino' : '';
        const read = tenant ? 'inquilino.arrangements.read' : 'arrangements.read';
        if (tenant || !legacyList)
            router.get(`${prefix}/orders`, async (request, response, next) => {
                // SPEC-39 clients retain their strict projection until the frontend upgrade.
                if (!tenant && !['2', '3'].includes(request.get('X-Arrangement-Contract') ?? '')) {
                    next();
                    return;
                }
                try {
                    const { scope, context } = await actor(request, read, tenant ? 'arrangements.tenant.read' : 'arrangements.orders.read');
                    if ((environment.ARRANGEMENT_REJECTION_ENABLED === 'true' || environment.ARRANGEMENT_REQUIRE_CURRENT_CLIENT === 'true') && request.get('X-Arrangement-Contract') !== '3') {
                        response.status(426).json({ error: 'CLIENT_UPDATE_REQUIRED' });
                        return;
                    }
                    response.json(request.get('X-Arrangement-Contract') === '3'
                        ? await service.listAssigned(scope, context, arrangementAudience(context), request.query)
                        : await service.list(scope, context, tenant, request.query));
                }
                catch (caught) {
                    fail(response, caught);
                }
            });
        router.get(`${prefix}/orders/:orderId/assets/:assetId/view`, async (request, response) => {
            try {
                const { scope, context } = await actor(request, read, 'asset.signed_view');
                response.json(await service.view(scope, context, tenant, String(request.params.orderId), String(request.params.assetId)));
            }
            catch (caught) {
                fail(response, caught);
            }
        });
    }
    router.patch('/orders/:orderId/status', secureMutation, async (request, response) => {
        try {
            const { scope, context } = await actor(request, 'arrangements.status.update', 'arrangements.status.update');
            if (request.body?.status === 'rejected' && environment.ARRANGEMENT_REJECTION_ENABLED !== 'true') {
                response.status(409).json({ error: 'FEATURE_DISABLED' });
                return;
            }
            if ((environment.ARRANGEMENT_REJECTION_ENABLED === 'true' || environment.ARRANGEMENT_REQUIRE_CURRENT_CLIENT === 'true') && request.get('X-Arrangement-Contract') !== '3') {
                response.status(426).json({ error: 'CLIENT_UPDATE_REQUIRED' });
                return;
            }
            response.json(request.get('X-Arrangement-Contract') === '3'
                ? await service.mutateAssignment(scope, context, String(request.params.orderId), 'status', request.body)
                : await service.status(scope, context, String(request.params.orderId), request.body));
        }
        catch (caught) {
            fail(response, caught);
        }
    });
    router.put('/orders/:orderId/work-report', secureMutation, async (request, response) => {
        try {
            const { scope, context } = await actor(request, 'personal.arrangements.report.write', 'arrangements.report.write');
            response.json(await service.saveWorkReport(scope, context, String(request.params.orderId), request.body));
        }
        catch (caught) {
            fail(response, caught);
        }
    });
    router.post('/orders/:orderId/work-report/submit', secureMutation, async (request, response) => {
        try {
            const { scope, context } = await actor(request, 'personal.arrangements.report.write', 'arrangements.report.submit');
            response.json(await service.submitWorkReport(scope, context, String(request.params.orderId), request.body));
        }
        catch (caught) {
            fail(response, caught);
        }
    });
    router.post('/orders/:orderId/work-report/accept', secureMutation, async (request, response) => {
        try {
            const { scope, context } = await actor(request, 'inquilino.arrangements.accept', 'arrangements.report.accept');
            response.json(await service.acceptWorkReport(scope, context, String(request.params.orderId), request.body));
        }
        catch (caught) {
            fail(response, caught);
        }
    });
    router.get('/personal/orders', async (request, response) => {
        try {
            const { scope, context } = await actor(request, 'personal.arrangements.read', 'arrangements.tenant.read');
            response.json(await service.listAssigned(scope, context, 'personal', request.query));
        }
        catch (caught) {
            fail(response, caught);
        }
    });
    for (const audience of ['personal', 'tenant', 'internal']) {
        const prefix = audience === 'personal' ? '/personal' : audience === 'tenant' ? '/inquilino' : '';
        const capability = audience === 'personal' ? 'personal.arrangements.read' : audience === 'tenant' ? 'inquilino.arrangements.read' : 'arrangements.read';
        router.get(`${prefix}/orders/:orderId`, async (request, response) => {
            try {
                const { scope, context } = await actor(request, capability, 'arrangements.tenant.read');
                response.json(await service.detail(scope, context, arrangementAudience(context), String(request.params.orderId)));
            }
            catch (caught) {
                fail(response, caught);
            }
        });
    }
    router.get('/personal/orders/:orderId/assets/:assetId/view', async (request, response) => {
        try {
            const { scope, context } = await actor(request, 'personal.arrangements.read', 'asset.signed_view');
            response.json(await service.assignedView(scope, context, 'personal', String(request.params.orderId), String(request.params.assetId)));
        }
        catch (caught) {
            fail(response, caught);
        }
    });
    router.get('/personal/assignees', async (request, response) => {
        try {
            const { scope, context } = await actor(request, 'arrangements.assignment.manage', 'arrangements.orders.read');
            response.json(await service.assignees(scope, context, request.query));
        }
        catch (caught) {
            fail(response, caught);
        }
    });
    for (const [method, path, action] of [['patch', 'assignment', 'assign'], ['delete', 'assignment', 'unassign'], ['post', 'reject', 'reject']]) {
        router[method](`/orders/:orderId/${path}`, secureMutation, async (request, response) => {
            try {
                const { scope, context } = await actor(request, action === 'reject' ? 'arrangements.status.update' : 'arrangements.assignment.manage', 'arrangements.status.update');
                if (action === 'reject' && environment.ARRANGEMENT_REJECTION_ENABLED !== 'true') {
                    response.status(409).json({ error: 'FEATURE_DISABLED' });
                    return;
                }
                response.json(await service.mutateAssignment(scope, context, String(request.params.orderId), action, request.body));
            }
            catch (caught) {
                fail(response, caught);
            }
        });
    }
    router.get('/changes', async (request, response) => {
        let timer;
        let closed = false;
        const stop = () => { closed = true; clearTimeout(timer); if (!response.writableEnded)
            response.end(); };
        response.on('close', stop);
        try {
            const initial = await sessions.context(request, String(request.params.organization ?? ''), undefined, false);
            const audience = arrangementAudience(initial);
            const { scope, context } = await actor(request, arrangementReadCapability(audience), 'arrangements.changes', false);
            const initialRevision = await service.changes(scope, context, audience);
            if (closed)
                return;
            response.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
            response.flushHeaders();
            const emit = (event, data) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            emit('ready', initialRevision);
            let revision = initialRevision.revision;
            const binding = (value) => JSON.stringify([value.session_id, value.user_id, value.organization.id, value.organization.status,
                value.membership.id, value.membership.role, value.membership.status, value.membership.arrangement_property_id]);
            const bound = binding(context);
            const started = Date.now();
            const tick = async () => {
                try {
                    if (closed)
                        return;
                    const current = await sessions.context(request, String(request.params.organization ?? ''), arrangementReadCapability(audience), false);
                    if (binding(current) !== bound) {
                        emit('revoked', {});
                        stop();
                        return;
                    }
                    const next = await service.changes(scope, current, audience);
                    if (closed)
                        return;
                    if (next.revision !== revision) {
                        revision = next.revision;
                        emit('invalidate', next);
                    }
                    if (Date.now() - started >= 20_000) {
                        emit('renew', {});
                        stop();
                        return;
                    }
                    timer = setTimeout(() => { void tick(); }, 500);
                }
                catch (caught) {
                    if (!closed) {
                        emit(caught instanceof IdentityAccessError || caught instanceof ArrangementRequestError ? 'revoked' : 'unavailable', {});
                        stop();
                    }
                }
            };
            timer = setTimeout(() => { void tick(); }, 500);
        }
        catch (caught) {
            if (!closed) {
                if (!response.headersSent)
                    fail(response, caught);
                stop();
            }
        }
    });
    router.post('/inquilino/order-drafts', secureMutation, async (request, response) => {
        try {
            const { scope, context } = await actor(request, 'inquilino.arrangements.create', 'arrangements.draft.create');
            response.status(201).json(await service.draft(scope, context, request.body, request.get('Idempotency-Key')));
        }
        catch (caught) {
            fail(response, caught);
        }
    });
    const base = '/inquilino/order-drafts/:orderId';
    router.post(`${base}/cancel`, secureMutation, async (request, response) => {
        try {
            const { scope, context } = await actor(request, 'inquilino.arrangements.create', 'arrangements.submit');
            response.json(await service.cancel(scope, context, String(request.params.orderId), request.body));
        }
        catch (caught) {
            fail(response, caught);
        }
    });
    router.post(`${base}/submit`, secureMutation, async (request, response) => {
        try {
            const { scope, context } = await actor(request, 'inquilino.arrangements.create', 'arrangements.submit');
            response.json(await service.submit(scope, context, String(request.params.orderId), request.body));
        }
        catch (caught) {
            fail(response, caught);
        }
    });
    router.post(`${base}/assets/sessions`, secureMutation, async (request, response) => {
        try {
            const { scope, context } = await actor(request, 'inquilino.arrangements.create', 'asset.upload_presign');
            response.json(await service.initialize(scope, context, String(request.params.orderId), request.body, request.get('Idempotency-Key')));
        }
        catch (caught) {
            fail(response, caught);
        }
    });
    for (const operation of ['finalize', 'revoke'])
        router.post(`${base}/assets/sessions/:sessionId/${operation}`, secureMutation, async (request, response) => {
            try {
                const { scope, context } = await actor(request, 'inquilino.arrangements.create', 'asset.upload_finalize');
                response.json(await service[operation](scope, context, String(request.params.orderId), String(request.params.sessionId), request.body));
            }
            catch (caught) {
                fail(response, caught);
            }
        });
    return router;
}
//# sourceMappingURL=arrangementRequests.js.map