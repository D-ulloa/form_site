import { createArrangementPropertiesRouter, type ArrangementPropertyDependencies } from './arrangementProperties.js';
import { Router } from 'express';
import { z } from 'zod';
import type { SessionService } from '../identity/sessionService.js';
import { IdentityAccessError } from '../identity/sessionSecurity.js';
import { createOrganizationScope } from '../platform/scope.js';
import { safeErrorEnvelope } from '../platform/errors.js';
import { createDistributedRateLimiter } from '../platform/rateLimit.js';
import { createPlatformRepository } from '../platform/platformRepository.js';
import { createArrangementOrderRepository } from '../arrangements/arrangementOrderRepository.js';
import { createListArrangementOrders } from '../services/listArrangementOrders.js';

interface Dependencies extends ArrangementPropertyDependencies {
  readonly list?: ReturnType<typeof createListArrangementOrders>;
  readonly limiter?: Pick<ReturnType<typeof createDistributedRateLimiter>, 'consume'>;
}

export function createArrangementsRouter(
  sessions: SessionService,
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: Dependencies = {},
): Router {
  const router = Router({ mergeParams: true });
  const list = dependencies.list ?? createListArrangementOrders(createArrangementOrderRepository(undefined, environment), environment);
  // Resolve protected dependencies only for an authorized request, like other platform repositories.
  const limiter = () => dependencies.limiter ?? createDistributedRateLimiter(
    createPlatformRepository(undefined, environment), environment.PLATFORM_RATE_LIMIT_PEPPER?.trim() ?? '',
  );
  router.use((_request, response, next) => {
    response.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' });
    next();
  });
  router.get('/orders', async (request, response) => {
    try {
      const organization = (request.params as Record<string, string | undefined>).organization ?? '';
      const context = await sessions.context(request, organization, 'arrangements.read');
      const scope = createOrganizationScope(context.organization.id);
      await limiter().consume({ scope, policy_key: 'arrangements.orders.read', principal_type: context.principal_type,
        principal_id: context.membership.id });
      response.json(await list(scope, request.query));
    } catch (error) {
      if (error instanceof IdentityAccessError) {
        response.status(error.status).json({ error: error.code, retriable: false });
      } else if (error instanceof z.ZodError) {
        response.status(400).json({ error: 'INVALID_REQUEST', retriable: false });
      } else {
        const safe = safeErrorEnvelope(error, String(response.locals.request_id ?? ''));
        if (safe.retry_after_seconds) response.set('Retry-After', String(safe.retry_after_seconds));
        response.status(safe.status).json(safe.body);
      }
    }
  });
  router.use(createArrangementPropertiesRouter(sessions, environment, dependencies));
  return router;
}
