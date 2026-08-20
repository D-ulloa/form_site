import { createClient } from '@supabase/supabase-js';
function assuranceFromToken(token) {
    try {
        const payload = JSON.parse(Buffer.from(token?.split('.')[1] ?? '', 'base64url').toString('utf8'));
        return payload.aal === 'aal2' ? 'aal2' : 'aal1';
    }
    catch {
        return 'aal1';
    }
}
function normalizeUser(user, method, token) {
    if (!user.id || !user.email)
        throw new Error('INVALID_CREDENTIALS');
    const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
    return { user_id: user.id, email: user.email.toLowerCase(),
        display_name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 256) : user.email,
        auth_method: method, assurance_level: assuranceFromToken(token) };
}
export function createSupabaseIdentityProvider(environment = process.env) {
    const url = environment.SUPABASE_URL?.trim();
    const key = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key)
        throw new Error('Supabase identity provider is unavailable.');
    const fresh = () => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    return {
        async password(email, password) {
            const { data, error } = await fresh().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
            if (error || !data.user)
                throw new Error('INVALID_CREDENTIALS');
            return normalizeUser(data.user, 'password', data.session?.access_token);
        },
        async accessToken(accessToken, expectedMethod) {
            const { data, error } = await fresh().auth.getUser(accessToken);
            if (error || !data.user)
                throw new Error('INVALID_CREDENTIALS');
            return normalizeUser(data.user, expectedMethod, accessToken);
        },
        async requestPasswordReset(email, redirectTo) {
            const { error } = await fresh().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
            if (error)
                throw new Error('RESET_UNAVAILABLE');
        },
        async updatePassword(userId, password) {
            const { error } = await fresh().auth.admin.updateUserById(userId, { password });
            if (error)
                throw new Error('ACCOUNT_UPDATE_UNAVAILABLE');
        },
        async updateEmail(userId, email) {
            const { error } = await fresh().auth.admin.updateUserById(userId, { email: email.trim().toLowerCase(), email_confirm: false });
            if (error)
                throw new Error('ACCOUNT_UPDATE_UNAVAILABLE');
        },
    };
}
//# sourceMappingURL=supabaseIdentityProvider.js.map