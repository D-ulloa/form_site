import { Router } from 'express';
import { z } from 'zod';
import type { SessionService } from '../identity/sessionService.js';
import { IdentityAccessError } from '../identity/sessionSecurity.js';
import { createTenantMutationSecurity } from './identity.js';
import { createOrganizationScope } from '../platform/scope.js';
import { safeErrorEnvelope } from '../platform/errors.js';
import { createDistributedRateLimiter } from '../platform/rateLimit.js';
import { createPlatformRepository } from '../platform/platformRepository.js';
import { OrganizationDomainError } from '../organizations/errors.js';
import { OrganizationValidationError } from '../organizations/validation.js';
import type { OrganizationService } from '../organizations/organizationService.js';
import { IdempotencyKey } from '../services/arrangementProperties.js';
import { hasOrganizationCapability } from '../organizations/roleCapabilities.js';

export interface ArrangementPersonalDependencies {
  readonly personal?: Pick<OrganizationService, 'invitePersonal' | 'rotatePersonalInvitation' | 'revokePersonalInvitation'>;
  readonly limiter?: Pick<ReturnType<typeof createDistributedRateLimiter>, 'consume'>;
}
export function createArrangementPersonalRouter(sessions: SessionService, environment: NodeJS.ProcessEnv,
  dependencies: ArrangementPersonalDependencies) {
  const router = Router({ mergeParams: true });
  const security = createTenantMutationSecurity(sessions, environment);
  for (const operation of ['create', 'rotate', 'revoke'] as const) {
    const path = operation === 'create' ? '/personal/invitations'
      : `/personal/invitations/:invitationId/${operation === 'rotate' ? 'rotate-link' : 'revoke'}`;
    router.post(path, security, async (request, response) => {
      try {
        // Recovery remains available after new issuance is disabled.
        const actor = await sessions.context(request, String(request.params.organization ?? ''));
        if (!hasOrganizationCapability(actor.membership.role, actor.membership.status, actor.organization.status, 'arrangements.personal.invite')) {
          throw new OrganizationDomainError('FORBIDDEN');
        }
        const scope = createOrganizationScope(actor.organization.id);
        const limiter = dependencies.limiter ?? createDistributedRateLimiter(createPlatformRepository(undefined, environment), environment.PLATFORM_RATE_LIMIT_PEPPER ?? '');
        await limiter.consume({ scope, policy_key: operation === 'create' ? 'member.invitation_create'
          : operation === 'rotate' ? 'member.invitation_resend' : 'member.invitation_revoke',
        principal_type: actor.principal_type, principal_id: actor.membership.id });
        if (!dependencies.personal) throw new OrganizationDomainError('DEPENDENCY_NOT_READY');
        if (operation === 'create') {
          const body = z.object({ email: z.string().min(3).max(320) }).strict().parse(request.body);
          response.status(201).json(await dependencies.personal.invitePersonal({ email: body.email,
            idempotency_key: IdempotencyKey.parse(request.get('Idempotency-Key')) }, actor));
        } else {
          z.object({}).strict().parse(request.body ?? {});
          const id = z.uuid().parse(request.params.invitationId);
          response.status(operation === 'rotate' ? 201 : 200).json(await (operation === 'rotate'
            ? dependencies.personal.rotatePersonalInvitation(id, actor) : dependencies.personal.revokePersonalInvitation(id, actor)));
        }
      } catch (caught) {
        if (caught instanceof OrganizationDomainError) response.status(caught.http_status).json({ error: caught.code });
        else if (caught instanceof IdentityAccessError) response.status(caught.status).json({ error: caught.code });
        else if (caught instanceof z.ZodError || caught instanceof OrganizationValidationError) response.status(400).json({ error: 'INVALID_REQUEST' });
        else {
          const safe = safeErrorEnvelope(caught, String(response.locals.request_id ?? ''));
          if (safe.retry_after_seconds) response.set('Retry-After', String(safe.retry_after_seconds));
          response.status(safe.status).json(safe.body);
        }
      }
    });
  }
  return router;
}
