import { Router } from 'express';
import { OrganizationDomainError } from '../organizations/errors.js';
function valueAt(value) {
    return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
function secureResponse(response) {
    response.set({
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
    });
}
function sendError(response, error) {
    secureResponse(response);
    if (error instanceof OrganizationDomainError) {
        response.status(error.http_status).json({ error: error.code });
        return;
    }
    response.status(500).json({ error: 'ORGANIZATION_OPERATION_FAILED' });
}
async function scopedActor(request, resolver) {
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
export function createOrganizationGovernanceRouter(resolver, services, publicBaseUrl) {
    const router = Router();
    router.post('/invitations/resolve', async (request, response) => {
        try {
            secureResponse(response);
            const token = typeof request.body?.invitation_token === 'string' ? request.body.invitation_token : '';
            response.json(await services.organizations.resolveInvitation(token));
        }
        catch (error) {
            sendError(response, error);
        }
    });
    router.post('/invitations/accept', async (request, response) => {
        try {
            secureResponse(response);
            const identity = await resolver.resolveInvitationIdentity(request);
            const token = typeof request.body?.invitation_token === 'string' ? request.body.invitation_token : '';
            const membership = await services.organizations.acceptInvitation(token, identity);
            response.json({ organization_id: membership.organization_id, context_refresh_required: true });
        }
        catch (error) {
            sendError(response, error);
        }
    });
    router.post('/organizations/:organizationId/invitations', async (request, response) => {
        try {
            secureResponse(response);
            const actor = await scopedActor(request, resolver);
            const body = request.body;
            if (typeof body.email !== 'string' || !['admin', 'member', 'viewer'].includes(String(body.intended_role))) {
                response.status(400).json({ error: 'INVALID_REQUEST' });
                return;
            }
            const result = await services.organizations.inviteMember({
                email: body.email,
                intended_role: body.intended_role,
                inviter_display_name: actor.display_name,
                public_base_url: publicBaseUrl,
            }, actor);
            response.status(201).json(result);
        }
        catch (error) {
            sendError(response, error);
        }
    });
    router.get('/organizations/:organizationId/settings', async (request, response) => {
        try {
            secureResponse(response);
            response.json(await services.settings.get(await scopedActor(request, resolver)));
        }
        catch (error) {
            sendError(response, error);
        }
    });
    router.patch('/organizations/:organizationId/settings', async (request, response) => {
        try {
            secureResponse(response);
            const actor = await scopedActor(request, resolver);
            const body = request.body;
            response.json(await services.settings.update({
                expected_version: Number(body.expected_version),
                record_visibility: body.record_visibility,
                public_display_name: typeof body.public_display_name === 'string' ? body.public_display_name : null,
                primary_color: typeof body.primary_color === 'string' ? body.primary_color : null,
                accent_color: typeof body.accent_color === 'string' ? body.accent_color : null,
                feature_defaults: body.feature_defaults && typeof body.feature_defaults === 'object'
                    ? body.feature_defaults : {},
            }, actor));
        }
        catch (error) {
            sendError(response, error);
        }
    });
    router.post('/organizations/:organizationId/invitations/:invitationId/resend', async (request, response) => {
        try {
            secureResponse(response);
            const actor = await scopedActor(request, resolver);
            const result = await services.organizations.resendInvitation(valueAt(request.params.invitationId), {
                inviter_display_name: actor.display_name,
                public_base_url: publicBaseUrl,
            }, actor);
            response.status(201).json(result);
        }
        catch (error) {
            sendError(response, error);
        }
    });
    router.post('/organizations/:organizationId/invitations/:invitationId/revoke', async (request, response) => {
        try {
            secureResponse(response);
            const actor = await scopedActor(request, resolver);
            const invitation = await services.organizations.revokeInvitation(valueAt(request.params.invitationId), actor);
            response.json({ invitation_id: invitation.id, status: invitation.status, version: invitation.version });
        }
        catch (error) {
            sendError(response, error);
        }
    });
    router.patch('/organizations/:organizationId/members/:userId', async (request, response) => {
        try {
            secureResponse(response);
            const actor = await scopedActor(request, resolver);
            const role = request.body?.role;
            if (!['admin', 'member', 'viewer'].includes(role) || !Number.isInteger(request.body?.expected_version)) {
                response.status(400).json({ error: 'INVALID_REQUEST' });
                return;
            }
            response.json(await services.memberships.changeRole(valueAt(request.params.userId), role, request.body.expected_version, actor));
        }
        catch (error) {
            sendError(response, error);
        }
    });
    router.post('/organizations/:organizationId/members/:userId/suspend', async (request, response) => {
        try {
            secureResponse(response);
            const actor = await scopedActor(request, resolver);
            response.json(await services.memberships.changeStatus(valueAt(request.params.userId), 'suspended', Number(request.body?.expected_version), String(request.body?.reason_code ?? ''), actor));
        }
        catch (error) {
            sendError(response, error);
        }
    });
    router.post('/organizations/:organizationId/members/:userId/reactivate', async (request, response) => {
        try {
            secureResponse(response);
            const actor = await scopedActor(request, resolver);
            response.json(await services.memberships.changeStatus(valueAt(request.params.userId), 'active', Number(request.body?.expected_version), '', actor));
        }
        catch (error) {
            sendError(response, error);
        }
    });
    router.delete('/organizations/:organizationId/members/:userId', async (request, response) => {
        try {
            secureResponse(response);
            const actor = await scopedActor(request, resolver);
            response.json(await services.memberships.changeStatus(valueAt(request.params.userId), 'removed', Number(request.body?.expected_version), String(request.body?.reason_code ?? ''), actor));
        }
        catch (error) {
            sendError(response, error);
        }
    });
    router.post('/organizations/:organizationId/ownership-transfers', async (request, response) => {
        try {
            secureResponse(response);
            const actor = await scopedActor(request, resolver);
            const body = request.body;
            response.json(await services.memberships.transferOwnership(String(body.target_user_id ?? ''), body.source_owner_role_after_transfer, Number(body.expected_organization_version), Number(body.expected_target_membership_version), body.confirmed === true, actor));
        }
        catch (error) {
            sendError(response, error);
        }
    });
    return router;
}
//# sourceMappingURL=organizationGovernance.js.map