import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
function clientFor(environment) {
    const url = environment.SUPABASE_URL?.trim();
    const key = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key)
        throw new Error('Identity persistence is unavailable.');
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function one(data, error) {
    if (error || !data)
        throw new Error(error?.message ?? 'Identity record was not returned.');
    return data;
}
export function createIdentityRepository(environment = process.env, override) {
    const client = () => override ?? clientFor(environment);
    return {
        async createSession(input) {
            const { data, error } = await client().rpc('spec27_create_session', {
                p_session_id: randomUUID(), p_user_id: input.identity.user_id,
                p_token_prefix: input.material.token_prefix, p_token_hash: input.material.token_hash,
                p_hash_version: input.material.hash_version, p_csrf_token_hash: input.material.csrf_token_hash,
                p_auth_method: input.identity.auth_method, p_assurance_level: input.identity.assurance_level,
                p_remembered: input.remembered, p_absolute_expires_at: input.absolute_expires_at,
                p_idle_expires_at: input.idle_expires_at, p_request_id: input.request_id,
                p_ip_network: input.ip_network, p_user_agent_summary: input.user_agent_summary,
                p_active_session_limit: input.active_session_limit,
            }).single();
            return one(data, error);
        },
        async findSession(prefix, hash) {
            const { data, error } = await client().from('app_sessions').select('*')
                .eq('token_prefix', prefix).eq('token_hash', hash).maybeSingle();
            if (error)
                throw new Error(error.message);
            return data;
        },
        async touchSession(session, idleExpiresAt, requestId, ip) {
            const { data, error } = await client().rpc('spec27_touch_session', {
                p_session_id: session.id, p_expected_version: session.version,
                p_idle_expires_at: idleExpiresAt, p_request_id: requestId, p_ip_network: ip,
            }).single();
            return one(data, error);
        },
        async rotateSession(session, material, absoluteExpiresAt, idleExpiresAt, requestId) {
            const { data, error } = await client().rpc('spec27_rotate_session', {
                p_current_session_id: session.id, p_expected_version: session.version,
                p_new_session_id: randomUUID(), p_new_token_prefix: material.token_prefix,
                p_new_token_hash: material.token_hash, p_new_csrf_token_hash: material.csrf_token_hash,
                p_hash_version: material.hash_version, p_absolute_expires_at: absoluteExpiresAt,
                p_idle_expires_at: idleExpiresAt, p_request_id: requestId,
            }).single();
            return one(data, error);
        },
        async revokeSession(session, reason, requestId) {
            const { error } = await client().rpc('spec27_revoke_session', {
                p_session_id: session.id, p_expected_version: session.version, p_actor_type: 'self',
                p_actor_id: session.user_id, p_reason: reason, p_request_id: requestId,
            });
            if (error)
                throw new Error(error.message);
        },
        async revokeOtherSessions(session, requestId) {
            const { data, error } = await client().rpc('spec27_revoke_user_sessions', {
                p_user_id: session.user_id, p_except_session_id: session.id, p_actor_type: 'self',
                p_actor_id: session.user_id, p_reason: 'user_revoke_all', p_request_id: requestId,
            });
            if (error)
                throw new Error(error.message);
            return Number(data ?? 0);
        },
        async listUserSessions(userId) {
            const { data, error } = await client().from('app_sessions').select('*').eq('user_id', userId)
                .order('created_at', { ascending: false }).limit(100);
            if (error)
                throw new Error(error.message);
            return (data ?? []);
        },
        async getUser(userId) {
            const [{ data: authData, error: authError }, { data: profile }] = await Promise.all([
                client().auth.admin.getUserById(userId),
                client().from('user_profiles').select('display_name').eq('user_id', userId).maybeSingle(),
            ]);
            if (authError || !authData.user || !authData.user.email)
                return null;
            const metadata = authData.user.user_metadata;
            return { id: authData.user.id, email: authData.user.email.toLowerCase(),
                display_name: typeof profile?.display_name === 'string' ? profile.display_name
                    : typeof metadata.full_name === 'string' ? metadata.full_name : authData.user.email };
        },
        async listMemberships(userId) {
            const { data, error } = await client().from('organization_memberships')
                .select('*, organization:organizations(*)').eq('user_id', userId).neq('status', 'removed')
                .order('joined_at', { ascending: true });
            if (error)
                throw new Error(error.message);
            return (data ?? []).map((row) => {
                const value = row;
                const { organization, ...membership } = value;
                return { membership: membership, organization };
            });
        },
        async getMembership(userId, organizationIdOrSlug) {
            const memberships = await this.listMemberships(userId);
            return memberships.find(({ organization }) => organization.id === organizationIdOrSlug || organization.slug === organizationIdOrSlug) ?? null;
        },
        async createApiKey(input) {
            const { data, error } = await client().rpc('spec27_create_api_key', {
                p_key_id: input.id, p_organization_id: input.organization_id, p_name: input.name,
                p_key_prefix: input.key_prefix, p_secret_hash: input.secret_hash,
                p_hash_version: input.hash_version, p_scopes: input.scopes,
                p_created_by_membership_id: input.created_by_membership_id,
                p_expires_at: input.expires_at, p_allowed_ip_cidrs: input.allowed_ip_cidrs,
                p_request_id: input.request_id,
            }).single();
            return one(data, error);
        },
        async findApiKey(prefix, hash) {
            const { data, error } = await client().from('organization_api_keys').select('*')
                .eq('key_prefix', prefix).eq('secret_hash', hash).maybeSingle();
            if (error)
                throw new Error(error.message);
            return data;
        },
        async touchApiKey(key, ip) {
            const { error } = await client().from('organization_api_keys').update({
                last_used_at: new Date().toISOString(), last_used_ip_network: ip, version: key.version + 1,
            }).eq('id', key.id).eq('organization_id', key.organization_id).eq('version', key.version);
            if (error)
                throw new Error(error.message);
        },
        async listApiKeys(organizationId) {
            const { data, error } = await client().from('organization_api_keys')
                .select('*').eq('organization_id', organizationId).order('created_at', { ascending: false });
            if (error)
                throw new Error(error.message);
            return (data ?? []);
        },
        async revokeApiKey(organizationId, keyId, membershipId, expectedVersion, reason, requestId) {
            const { error } = await client().rpc('spec27_revoke_api_key', {
                p_organization_id: organizationId, p_key_id: keyId, p_expected_version: expectedVersion,
                p_actor_membership_id: membershipId, p_reason: reason, p_request_id: requestId,
            });
            if (error)
                throw new Error(error.message);
        },
    };
}
//# sourceMappingURL=identityRepository.js.map