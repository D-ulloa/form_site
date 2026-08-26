import { Router, type Request } from 'express';
import type { MembershipService } from '../organizations/membershipService.js';
import type { OrganizationService } from '../organizations/organizationService.js';
import type { OrganizationSettingsService } from '../organizations/organizationSettingsService.js';
import type { InvitationWorkflowService } from '../organizations/invitationWorkflow.js';
import type { RateLimitPolicyKey } from '../platform/rateLimit.js';
import { createOrganizationScope } from '../platform/scope.js';
import type { InvitationIdentityContext, OrganizationActorContext } from '../organizations/types.js';
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
    consume(input: {
        policy_key: RateLimitPolicyKey;
        principal_type: string;
        principal_id: string;
        client_ip?: string;
        target_id?: string;
        scope?: ReturnType<typeof createOrganizationScope>;
    }): Promise<unknown>;
}
/**
 * SPEC-26 route adapter. It is deliberately not registered in index.ts.
 * SPEC-27 may mount it only with a server-validated, revocable context resolver.
 */
export declare function createOrganizationGovernanceRouter(resolver: OrganizationRouteContextResolver, services: OrganizationRouteServices, publicBaseUrl: string, rateLimiter?: InvitationRouteRateLimiter): Router;
export declare function createInvitationWebhookRouter(service: InvitationWorkflowService, environment?: NodeJS.ProcessEnv, rateLimiter?: InvitationRouteRateLimiter): Router;
//# sourceMappingURL=organizationGovernance.d.ts.map