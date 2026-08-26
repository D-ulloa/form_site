import { Router, type Request, type Response } from 'express';
import { OrganizationDomainError } from '../organizations/errors.js';
import type { MembershipService } from '../organizations/membershipService.js';
import type { OrganizationService } from '../organizations/organizationService.js';
import type { OrganizationSettingsService } from '../organizations/organizationSettingsService.js';
import type { InvitationWorkflowService } from '../organizations/invitationWorkflow.js';
import { invitationDeliveryConfiguration, verifyResendWebhook } from '../organizations/invitationDelivery.js';
import { PlatformError } from '../platform/errors.js';
import type { RateLimitPolicyKey } from '../platform/rateLimit.js';
import { createOrganizationScope } from '../platform/scope.js';
import type {
  InvitationIdentityContext,
  OrganizationActorContext,
  OrganizationRole,
} from '../organizations/types.js';

export interface OrganizationRouteContextResolver {
  resolveOrganizationActor(request: Request): Promise<OrganizationActorContext>;
  resolveInvitationIdentity(request: Request): Promise<InvitationIdentityContext>;
}

export interface OrganizationRouteServices {
  readonly organizations: OrganizationService;
  readonly memberships: MembershipService;
  readonly settings: OrganizationSettingsService;
  readonly invitations: InvitationWorkflowService;
}

export interface InvitationRouteRateLimiter {
  consume(input: { policy_key: RateLimitPolicyKey; principal_type: string; principal_id: string;
    client_ip?: string; target_id?: string; scope?: ReturnType<typeof createOrganizationScope> }): Promise<unknown>;
}

function valueAt(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function secureResponse(response: Response): void {
  response.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
}

function sendError(response: Response, error: unknown): void {
  secureResponse(response);
  if (error instanceof OrganizationDomainError) {
    response.status(error.http_status).json({ error: error.code });
    return;
  }
  if (error instanceof PlatformError) {
    if (error.retry_after_seconds) response.set('Retry-After', String(error.retry_after_seconds));
    response.status(error.status).json({ error: error.code });
    return;
  }
  response.status(500).json({ error: 'ORGANIZATION_OPERATION_FAILED' });
}

async function scopedActor(
  request: Request,
  resolver: OrganizationRouteContextResolver,
): Promise<OrganizationActorContext> {
  const actor = await resolver.resolveOrganizationActor(request);
  if (actor.organization.id !== valueAt(request.params.organizationId)) {
    throw new OrganizationDomainError('NOT_FOUND');
  }
  return actor;
}

/**
 * SPEC-26 route adapter. It is deliberately not registered in index.ts.
 * SPEC-27 may mount it only with a server-validated, revocable context resolver.
 */
export function createOrganizationGovernanceRouter(
  resolver: OrganizationRouteContextResolver,
  services: OrganizationRouteServices,
  publicBaseUrl: string,
  rateLimiter?: InvitationRouteRateLimiter,
): Router {
  const router = Router();

  const handoffCookie = 'form_site_invitation_handoff';
  const cookieValue = (request: Request): [string, string] | null => {
    const raw = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${handoffCookie}=`))
      ?.slice(handoffCookie.length + 1) ?? '';
    const [handle, binding] = raw.split('.'); return handle && binding ? [handle, binding] : null;
  };
  const requestOrigin = (request: Request): string => request.get('origin') ?? '';
  const expectedOrigin = new URL(publicBaseUrl).origin;
  const secureAttribute = new URL(publicBaseUrl).protocol === 'https:' ? '; Secure' : '';
  const assertHandoffOrigin = (request: Request): string => {
    const origin = requestOrigin(request);
    if (origin !== expectedOrigin) throw new OrganizationDomainError('INVITATION_INVALID');
    return origin;
  };
  const clearHandoff = `${handoffCookie}=; Path=/api/invitations; HttpOnly${secureAttribute}; SameSite=Strict; Max-Age=0`;
  const limitPublic = (request: Request, policy_key: RateLimitPolicyKey, target_id: string) => rateLimiter?.consume({
    policy_key, principal_type: 'anonymous_browser', principal_id: 'invitation',
    ...(request.ip ? { client_ip: request.ip } : {}), target_id,
  });
  const limitActor = (request: Request, actor: OrganizationActorContext, policy_key: RateLimitPolicyKey,
    target_id?: string) => rateLimiter?.consume({ policy_key, principal_type: 'member', principal_id: actor.user_id,
    ...(request.ip ? { client_ip: request.ip } : {}), ...(target_id ? { target_id } : {}),
    scope: createOrganizationScope(actor.organization.id) });

  router.post('/invitations/handoff', async (request, response) => {
    try {
      secureResponse(response);
      const token = typeof request.body?.invitation_token === 'string' ? request.body.invitation_token : '';
      await limitPublic(request, 'member.invitation_handoff', token);
      const prior = cookieValue(request);
      const material = await services.invitations.createHandoff(token, prior?.[1] ?? null, assertHandoffOrigin(request));
      response.set('Set-Cookie', `${handoffCookie}=${material.handle}.${material.browser_binding}; Path=/api/invitations; HttpOnly${secureAttribute}; SameSite=Strict; Max-Age=${material.max_age_seconds}`);
      response.status(201).json({ handoff_ready: true, expires_in_seconds: material.max_age_seconds });
    } catch (error) { sendError(response, error); }
  });

  router.post('/invitations/resolve', async (request, response) => {
    try { secureResponse(response); const material = cookieValue(request);
      if (!material) throw new OrganizationDomainError('INVITATION_INVALID');
      await limitPublic(request, 'member.invitation_resolve', material[0]);
      const result = await services.invitations.resolveHandoff(material[0], material[1], assertHandoffOrigin(request));
      if (!result) throw new OrganizationDomainError('INVITATION_INVALID'); response.json(result);
    } catch (error) { sendError(response, error); }
  });

  router.post('/invitations/accept', async (request, response) => {
    try {
      secureResponse(response);
      const material = cookieValue(request); if (!material) throw new OrganizationDomainError('INVITATION_INVALID');
      await limitPublic(request, 'member.invitation_accept', material[0]);
      const identity = await resolver.resolveInvitationIdentity(request);
      const accepted = await services.invitations.acceptHandoff(material[0], material[1], assertHandoffOrigin(request), identity);
      response.set('Set-Cookie', clearHandoff);
      response.json({ organization_id: accepted.membership.organization_id,
        organization_slug: accepted.organization_slug, context_refresh_required: true });
    } catch (error) { sendError(response, error); }
  });

  router.post('/organizations/:organizationId/invitations', async (request, response) => {
    try {
      secureResponse(response);
      const actor = await scopedActor(request, resolver);
      await limitActor(request, actor, 'member.invitation_create');
      const body = request.body as Record<string, unknown>;
      if (typeof body.email !== 'string' || !['admin', 'member', 'viewer'].includes(String(body.intended_role))) {
        response.status(400).json({ error: 'INVALID_REQUEST' });
        return;
      }
      const result = await services.organizations.inviteMember({
        email: body.email,
        intended_role: body.intended_role as 'admin' | 'member' | 'viewer',
        inviter_display_name: actor.display_name,
        public_base_url: publicBaseUrl,
      }, actor);
      response.status(201).json(result);
    } catch (error) { sendError(response, error); }
  });

  router.get('/organizations/:organizationId/members', async (request, response) => {
    try { secureResponse(response); const actor = await scopedActor(request, resolver);
      response.json(await services.invitations.listMembers(actor, typeof request.query.cursor === 'string' ? request.query.cursor : null));
    } catch (error) { sendError(response, error); }
  });

  router.get('/organizations/:organizationId/invitations', async (request, response) => {
    try { secureResponse(response); const actor = await scopedActor(request, resolver);
      response.json(await services.invitations.listInvitations(actor, typeof request.query.cursor === 'string' ? request.query.cursor : null));
    } catch (error) { sendError(response, error); }
  });

  router.get('/organizations/:organizationId/settings', async (request, response) => {
    try {
      secureResponse(response);
      response.json(await services.settings.get(await scopedActor(request, resolver)));
    } catch (error) { sendError(response, error); }
  });

  router.patch('/organizations/:organizationId/settings', async (request, response) => {
    try {
      secureResponse(response);
      const actor = await scopedActor(request, resolver);
      const body = request.body as Record<string, unknown>;
      response.json(await services.settings.update({
        expected_version: Number(body.expected_version),
        record_visibility: body.record_visibility as 'organization' | 'assigned_only',
        public_display_name: typeof body.public_display_name === 'string' ? body.public_display_name : null,
        primary_color: typeof body.primary_color === 'string' ? body.primary_color : null,
        accent_color: typeof body.accent_color === 'string' ? body.accent_color : null,
        feature_defaults: body.feature_defaults && typeof body.feature_defaults === 'object'
          ? body.feature_defaults as Readonly<Record<string, unknown>> : {},
      }, actor));
    } catch (error) { sendError(response, error); }
  });

  router.post('/organizations/:organizationId/invitations/:invitationId/resend', async (request, response) => {
    try {
      secureResponse(response);
      const actor = await scopedActor(request, resolver);
      await limitActor(request, actor, 'member.invitation_resend', valueAt(request.params.invitationId));
      const result = await services.organizations.resendInvitation(valueAt(request.params.invitationId), {
        inviter_display_name: actor.display_name,
        public_base_url: publicBaseUrl,
      }, actor);
      response.status(201).json(result);
    } catch (error) { sendError(response, error); }
  });

  router.post('/organizations/:organizationId/invitations/:invitationId/revoke', async (request, response) => {
    try {
      secureResponse(response);
      const actor = await scopedActor(request, resolver);
      await limitActor(request, actor, 'member.invitation_revoke', valueAt(request.params.invitationId));
      const invitation = await services.organizations.revokeInvitation(valueAt(request.params.invitationId), actor);
      response.json({ invitation_id: invitation.id, status: invitation.status, version: invitation.version });
    } catch (error) { sendError(response, error); }
  });

  router.patch('/organizations/:organizationId/members/:userId', async (request, response) => {
    try {
      secureResponse(response);
      const actor = await scopedActor(request, resolver);
      const role = request.body?.role as Exclude<OrganizationRole, 'owner'>;
      if (!['admin', 'member', 'viewer'].includes(role) || !Number.isInteger(request.body?.expected_version)) {
        response.status(400).json({ error: 'INVALID_REQUEST' });
        return;
      }
      response.json(await services.memberships.changeRole(
        valueAt(request.params.userId), role, request.body.expected_version as number, actor,
      ));
    } catch (error) { sendError(response, error); }
  });

  router.post('/organizations/:organizationId/members/:userId/suspend', async (request, response) => {
    try {
      secureResponse(response);
      const actor = await scopedActor(request, resolver);
      response.json(await services.memberships.changeStatus(
        valueAt(request.params.userId), 'suspended', Number(request.body?.expected_version),
        String(request.body?.reason_code ?? ''), actor,
      ));
    } catch (error) { sendError(response, error); }
  });

  router.post('/organizations/:organizationId/members/:userId/reactivate', async (request, response) => {
    try {
      secureResponse(response);
      const actor = await scopedActor(request, resolver);
      response.json(await services.memberships.changeStatus(
        valueAt(request.params.userId), 'active', Number(request.body?.expected_version), '', actor,
      ));
    } catch (error) { sendError(response, error); }
  });

  router.delete('/organizations/:organizationId/members/:userId', async (request, response) => {
    try {
      secureResponse(response);
      const actor = await scopedActor(request, resolver);
      response.json(await services.memberships.changeStatus(
        valueAt(request.params.userId), 'removed', Number(request.body?.expected_version),
        String(request.body?.reason_code ?? ''), actor,
      ));
    } catch (error) { sendError(response, error); }
  });

  router.post('/organizations/:organizationId/ownership-transfers', async (request, response) => {
    try {
      secureResponse(response);
      const actor = await scopedActor(request, resolver);
      const body = request.body as Record<string, unknown>;
      response.json(await services.memberships.transferOwnership(
        String(body.target_user_id ?? ''),
        body.source_owner_role_after_transfer as OrganizationRole,
        Number(body.expected_organization_version),
        Number(body.expected_target_membership_version),
        body.confirmed === true,
        actor,
      ));
    } catch (error) { sendError(response, error); }
  });

  return router;
}

export function createInvitationWebhookRouter(service: InvitationWorkflowService,
  environment: NodeJS.ProcessEnv = process.env, rateLimiter?: InvitationRouteRateLimiter): Router {
  const router = Router(); const config = invitationDeliveryConfiguration(environment);
  router.post('/', async (request, response) => {
    try {
      const payload = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      await rateLimiter?.consume({ policy_key: 'provider.invitation_webhook', principal_type: 'provider',
        principal_id: 'resend', ...(request.ip ? { client_ip: request.ip } : {}) });
      if (payload.length === 0 || payload.length > 65_536) throw new Error('WEBHOOK_INVALID');
      const verified = verifyResendWebhook(payload, { 'svix-id': request.get('svix-id'),
        'svix-timestamp': request.get('svix-timestamp'), 'svix-signature': request.get('svix-signature') }, config.webhook_secret);
      const body = verified.body as { type?: unknown; data?: { email_id?: unknown } };
      if (!['email.delivered', 'email.bounced', 'email.complained'].includes(String(body.type))
        || typeof body.data?.email_id !== 'string' || body.data.email_id.length > 256) throw new Error('WEBHOOK_INVALID');
      const recorded = await service.webhook(verified.event_id, String(body.type), body.data.email_id);
      response.status(200).json({ recorded });
    } catch (error) {
      if (error instanceof PlatformError) sendError(response, error);
      else response.status(400).json({ error: 'WEBHOOK_INVALID' });
    }
  });
  return router;
}
