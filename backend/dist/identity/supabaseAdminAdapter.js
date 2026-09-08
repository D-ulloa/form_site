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
function sessionIdentity(user, method) {
    const projected = project(user);
    if (!projected)
        throw new IdentityProviderUnavailableError();
    const fullName = user.user_metadata?.full_name;
    return {
        user_id: projected.id,
        email: projected.email_normalized,
        display_name: typeof fullName === 'string' && fullName.trim() ? fullName.trim().slice(0, 256) : projected.email_normalized,
        auth_method: method,
        assurance_level: 'aal1',
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
        async createPassword(emailNormalized, password, displayName) {
            const { data, error } = await client.auth.admin.createUser({
                email: emailNormalized,
                password,
                // SPEC-41 explicitly makes verification informative rather than a login gate.
                email_confirm: true,
                user_metadata: { full_name: displayName },
                app_metadata: {},
            });
            if (error || !data.user)
                throw new IdentityProviderAmbiguousError();
            return sessionIdentity(data.user, 'password');
        },
        async sessionIdentity(userId, method) {
            const { data, error } = await client.auth.admin.getUserById(userId);
            if (error || !data.user)
                throw new IdentityProviderUnavailableError();
            return sessionIdentity(data.user, method);
        },
    };
}
//# sourceMappingURL=supabaseAdminAdapter.js.map