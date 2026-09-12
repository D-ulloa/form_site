import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { SessionService } from '../identity/sessionService.js';
import { IdentityAccessError } from '../identity/sessionSecurity.js';
import { createTenantMutationSecurity } from './identity.js';
import { createOrganizationScope } from '../platform/scope.js';
import { safeErrorEnvelope } from '../platform/errors.js';
import { createDistributedRateLimiter, type RateLimitPolicyKey } from '../platform/rateLimit.js';
import { createPlatformRepository } from '../platform/platformRepository.js';
import { createArrangementPropertyRepository, type PropertyCollection } from '../arrangements/arrangementPropertyRepository.js';
import { createArrangementPropertiesService, IdempotencyKey } from '../services/arrangementProperties.js';
import { OrganizationDomainError } from '../organizations/errors.js';
import { OrganizationValidationError } from '../organizations/validation.js';
import type { OrganizationService } from '../organizations/organizationService.js';
import type { OrganizationCapability } from '../organizations/types.js';

export interface ArrangementPropertyDependencies {
  readonly properties?: ReturnType<typeof createArrangementPropertiesService>;
  readonly organizations?: Pick<OrganizationService, 'inviteMember'>;
  readonly limiter?: Pick<ReturnType<typeof createDistributedRateLimiter>, 'consume'>;
}

export function createArrangementPropertiesRouter(sessions: SessionService, environment: NodeJS.ProcessEnv,
  dependencies: ArrangementPropertyDependencies) {
  const router = Router({ mergeParams: true });
  const service = dependencies.properties ?? createArrangementPropertiesService(createArrangementPropertyRepository(undefined, environment), environment);
  const secureMutation = createTenantMutationSecurity(sessions, environment);
  async function actor(request: Request, capability: OrganizationCapability, policy: RateLimitPolicyKey) {
    const context = await sessions.context(request, String(request.params.organization ?? ''), capability);
    const scope = createOrganizationScope(context.organization.id);
    const limiter = dependencies.limiter ?? createDistributedRateLimiter(createPlatformRepository(undefined, environment), environment.PLATFORM_RATE_LIMIT_PEPPER ?? '');
    await limiter.consume({ scope, policy_key: policy, principal_type: context.principal_type, principal_id: context.membership.id });
    return { scope, context };
  }
  function error(response: Response, caught: unknown) {
    if (caught instanceof OrganizationDomainError) response.status(caught.http_status).json({ error: caught.code });
    else if (caught instanceof IdentityAccessError) response.status(caught.status).json({ error: caught.code });
    else if (caught instanceof z.ZodError || caught instanceof OrganizationValidationError) response.status(400).json({ error: 'INVALID_REQUEST' });
    else {
      const safe = safeErrorEnvelope(caught, String(response.locals.request_id ?? ''));
      if (safe.retry_after_seconds) response.set('Retry-After', String(safe.retry_after_seconds));
      response.status(safe.status).json(safe.body);
    }
  }
  const collections: readonly [string, PropertyCollection][] = [
    ['/properties', 'properties'], ['/inquilinos/available', 'available'],
    ['/properties/:propertyId/inquilinos', 'inquilinos'], ['/properties/:propertyId/invitations', 'invitations'],
  ];
  for (const [path, collection] of collections) router.get(path, async (request, response) => {
    try {
      const { scope, context } = await actor(request, collection === 'properties' ? 'arrangements.read' : 'arrangements.inquilinos.manage',
        collection === 'properties' ? 'arrangements.properties.read' : 'arrangements.inquilinos.read');
      response.json(await service.list(scope, context, collection, request.params.propertyId ? String(request.params.propertyId) : null, request.query));
    } catch (caught) { error(response, caught); }
  });
  router.post('/properties', secureMutation, async (request, response) => {
    try {
      const { scope, context } = await actor(request, 'arrangements.properties.create', 'arrangements.properties.create');
      response.status(201).json(await service.create(scope, context, request.body, request.get('Idempotency-Key')));
    } catch (caught) { error(response, caught); }
  });
  router.post('/properties/:propertyId/inquilinos', secureMutation, async (request, response) => {
    try {
      const { scope, context } = await actor(request, 'arrangements.inquilinos.manage', 'arrangements.inquilinos.associate');
      response.json(await service.associate(scope, context, String(request.params.propertyId), request.body));
    } catch (caught) { error(response, caught); }
  });
  router.post('/properties/:propertyId/invitations', secureMutation, async (request, response) => {
    try {
      const { context } = await actor(request, 'arrangements.inquilinos.manage', 'member.invitation_create');
      const body = z.object({ email: z.string().trim().min(3).max(320) }).strict().parse(request.body);
      const propertyId = z.uuid().parse(request.params.propertyId);
      const key = IdempotencyKey.parse(request.get('Idempotency-Key'));
      if (!dependencies.organizations) throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
      response.status(201).json(await dependencies.organizations.inviteMember({ email: body.email, intended_role: 'inquilino',
        arrangement_property_id: propertyId, idempotency_key: key, inviter_display_name: context.display_name,
        public_base_url: environment.APP_PUBLIC_BASE_URL ?? '' }, context));
    } catch (caught) { error(response, caught); }
  });
  return router;
}
