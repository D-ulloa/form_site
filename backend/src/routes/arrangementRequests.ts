import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { SessionService } from '../identity/sessionService.js';
import { IdentityAccessError } from '../identity/sessionSecurity.js';
import { OrganizationDomainError } from '../organizations/errors.js';
import type { OrganizationCapability } from '../organizations/types.js';
import { createTenantMutationSecurity } from './identity.js';
import { createOrganizationScope } from '../platform/scope.js';
import { safeErrorEnvelope } from '../platform/errors.js';
import { createDistributedRateLimiter, type RateLimitPolicyKey } from '../platform/rateLimit.js';
import { createPlatformRepository } from '../platform/platformRepository.js';
import { createArrangementRequestRepository, ArrangementRequestError } from '../arrangements/requestRepository.js';
import { createArrangementRequestsService } from '../services/arrangementRequests.js';
import { createSupabaseAssetStorageAdapter } from '../assets/storageAdapter.js';
import { createAssetContentDetector } from '../assets/contentDetector.js';

export interface ArrangementRequestDependencies {
  requests?: ReturnType<typeof createArrangementRequestsService>;
  limiter?: Pick<ReturnType<typeof createDistributedRateLimiter>, 'consume'>;
}
export function createArrangementRequestsRouter(sessions: SessionService, environment: NodeJS.ProcessEnv, dependencies: ArrangementRequestDependencies = {}, legacyList = false) {
  const router = Router({ mergeParams: true });
  const service = dependencies.requests ?? createArrangementRequestsService(createArrangementRequestRepository(undefined, environment), {
    storage: createSupabaseAssetStorageAdapter(undefined, environment), detectContent: createAssetContentDetector(undefined, environment),
  }, environment);
  const secureMutation = createTenantMutationSecurity(sessions, environment);
  async function actor(request: Request, capability: OrganizationCapability, policy: RateLimitPolicyKey) {
    const context = await sessions.context(request, String(request.params.organization ?? ''), capability);
    const scope = createOrganizationScope(context.organization.id);
    const limiter = dependencies.limiter ?? createDistributedRateLimiter(createPlatformRepository(undefined, environment), environment.PLATFORM_RATE_LIMIT_PEPPER ?? '');
    await limiter.consume({ scope, policy_key: policy, principal_type: context.principal_type, principal_id: context.membership.id });
    return { scope, context };
  }
  function fail(response: Response, caught: unknown) {
    if (caught instanceof ArrangementRequestError) response.status(caught.status).json({ error: caught.code, ...(caught.current ? { current: caught.current } : {}) });
    else if (caught instanceof OrganizationDomainError) response.status(caught.http_status).json({ error: caught.code });
    else if (caught instanceof IdentityAccessError) response.status(caught.status).json({ error: caught.code });
    else if (caught instanceof z.ZodError) response.status(400).json({ error: 'INVALID_REQUEST' });
    else {
      const safe = safeErrorEnvelope(caught, String(response.locals.request_id ?? ''));
      if (safe.retry_after_seconds) response.set('Retry-After', String(safe.retry_after_seconds));
      response.status(safe.status).json(safe.body);
    }
  }
  for (const tenant of [false, true]) {
    const prefix = tenant ? '/inquilino' : '';
    const read = tenant ? 'inquilino.arrangements.read' : 'arrangements.read';
    if (tenant || !legacyList) router.get(`${prefix}/orders`, async (request, response, next) => {
      // SPEC-39 clients retain their strict projection until the frontend upgrade.
      if (!tenant && request.get('X-Arrangement-Contract') !== '2') { next(); return; }
      try {
        const { scope, context } = await actor(request, read, tenant ? 'arrangements.tenant.read' : 'arrangements.orders.read');
        response.json(await service.list(scope, context, tenant, request.query));
      } catch (caught) { fail(response, caught); }
    });
    router.get(`${prefix}/orders/:orderId/assets/:assetId/view`, async (request, response) => {
      try {
        const { scope, context } = await actor(request, read, 'asset.signed_view');
        response.json(await service.view(scope, context, tenant, String(request.params.orderId), String(request.params.assetId)));
      } catch (caught) { fail(response, caught); }
    });
  }
  router.patch('/orders/:orderId/status', secureMutation, async (request, response) => {
    try {
      const { scope, context } = await actor(request, 'arrangements.status.update', 'arrangements.status.update');
      response.json(await service.status(scope, context, String(request.params.orderId), request.body));
    } catch (caught) { fail(response, caught); }
  });
  router.post('/inquilino/order-drafts', secureMutation, async (request, response) => {
    try {
      const { scope, context } = await actor(request, 'inquilino.arrangements.create', 'arrangements.draft.create');
      response.status(201).json(await service.draft(scope, context, request.body, request.get('Idempotency-Key')));
    } catch (caught) { fail(response, caught); }
  });
  const base = '/inquilino/order-drafts/:orderId';
  router.post(`${base}/cancel`, secureMutation, async (request, response) => {
    try {
      const { scope, context } = await actor(request, 'inquilino.arrangements.create', 'arrangements.submit');
      response.json(await service.cancel(scope, context, String(request.params.orderId), request.body));
    } catch (caught) { fail(response, caught); }
  });
  router.post(`${base}/submit`, secureMutation, async (request, response) => {
    try {
      const { scope, context } = await actor(request, 'inquilino.arrangements.create', 'arrangements.submit');
      response.json(await service.submit(scope, context, String(request.params.orderId), request.body));
    } catch (caught) { fail(response, caught); }
  });
  router.post(`${base}/assets/sessions`, secureMutation, async (request, response) => {
    try {
      const { scope, context } = await actor(request, 'inquilino.arrangements.create', 'asset.upload_presign');
      response.json(await service.initialize(scope, context, String(request.params.orderId), request.body, request.get('Idempotency-Key')));
    } catch (caught) { fail(response, caught); }
  });
  for (const operation of ['finalize', 'revoke'] as const) router.post(`${base}/assets/sessions/:sessionId/${operation}`, secureMutation, async (request, response) => {
    try {
      const { scope, context } = await actor(request, 'inquilino.arrangements.create', 'asset.upload_finalize');
      response.json(await service[operation](scope, context, String(request.params.orderId), String(request.params.sessionId), request.body));
    } catch (caught) { fail(response, caught); }
  });
  return router;
}
