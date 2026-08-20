function routeOrganization(request) {
    const value = request.params.organizationId ?? request.params.organization;
    return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
export function createOrganizationRouteContextResolver(service) {
    return {
        async resolveOrganizationActor(request) {
            const context = await service.context(request, routeOrganization(request));
            return { request_id: context.request_id, user_id: context.user_id,
                display_name: context.display_name, organization: context.organization, membership: context.membership };
        },
        async resolveInvitationIdentity(request) {
            const authenticated = await service.authenticate(request);
            return { request_id: String(request.res?.locals.request_id ?? ''), user_id: authenticated.identity.id,
                verified_email: authenticated.identity.email };
        },
    };
}
//# sourceMappingURL=organizationContextResolver.js.map