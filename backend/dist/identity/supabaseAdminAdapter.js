import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { normalizeOrganizationEmail } from '../organizations/validation.js';
export class IdentityProviderUnavailableError extends Error {
    constructor() { super('IDENTITY_PROVIDER_UNAVAILABLE'); this.name = 'IdentityProviderUnavailableError'; }
}
export class IdentityProviderAmbiguousError extends Error {
    constructor() { super('IDENTITY_PROVIDER_AMBIGUOUS'); this.name = 'IdentityProviderAmbiguousError'; }
}
function project(user) {
    if (!user.email)
        return null;
    const extra = user;
    return {
        id: user.id,
        email_normalized: normalizeOrganizationEmail(user.email),
        activation_required: !(user.email_confirmed_at ?? user.confirmed_at),
        eligible: (!user.banned_until || new Date(user.banned_until).getTime() <= Date.now()) && !extra.deleted_at,
    };
}
/** The only Auth Admin surface exposed to provisioning code. */
export function createSupabaseAdminAdapter(environment = process.env) {
    const client = createPlatformServiceRoleClient(environment);
    return {
        async resolveByEmail(emailNormalized) {
            const matches = [];
            for (let page = 1; page <= 100; page += 1) {
                const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
                if (error)
                    throw new IdentityProviderUnavailableError();
                for (const raw of data.users) {
                    const user = project(raw);
                    if (user?.email_normalized === emailNormalized)
                        matches.push(user);
                }
                if (data.users.length < 1000)
                    return matches;
            }
            // A truncated provider inventory cannot prove uniqueness.
            throw new IdentityProviderAmbiguousError();
        },
        async createInviteOnly(emailNormalized) {
            const { data, error } = await client.auth.admin.createUser({
                email: emailNormalized,
                email_confirm: false,
                user_metadata: {},
                app_metadata: {},
            });
            const user = data.user ? project(data.user) : null;
            if (error || !user)
                throw new IdentityProviderAmbiguousError();
            return user;
        },
    };
}
//# sourceMappingURL=supabaseAdminAdapter.js.map