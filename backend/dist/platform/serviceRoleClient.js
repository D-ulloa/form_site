import { createClient } from '@supabase/supabase-js';
/** New multi-tenant platform code must obtain the privileged client only here. */
export function createPlatformServiceRoleClient(environment = process.env) {
    const url = environment.SUPABASE_URL?.trim();
    const key = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key)
        throw new Error('PLATFORM_DATABASE_UNAVAILABLE');
    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { 'X-Client-Info': 'form-site-platform-v1' } },
    });
}
//# sourceMappingURL=serviceRoleClient.js.map