import type { SupabaseClient } from '@supabase/supabase-js';
import { type SelfServiceOnboardingOperation } from './selfServiceOnboardingTypes.js';
export interface SelfServiceOnboardingRepository {
    claim(input: {
        readonly operation_id: string;
        readonly email_fingerprint: string;
        readonly payload_fingerprint: string;
        readonly display_name: string;
        readonly organization_display_name: string;
        readonly organization_slug: string;
        readonly plan_key: 'standard';
        readonly locale: string;
        readonly time_zone: string;
        readonly terms_version: string;
        readonly auth_method: 'password' | 'google';
        readonly request_id: string;
    }): Promise<SelfServiceOnboardingOperation>;
    markIdentity(operationId: string, userId: string, emailFingerprint: string, authMethod: 'password' | 'google', requestId: string): Promise<SelfServiceOnboardingOperation>;
    reject(operationId: string, reasonCode: string, requestId: string): Promise<void>;
    complete(operationId: string, userId: string, requestId: string): Promise<SelfServiceOnboardingOperation>;
    get(operationId: string, userId: string): Promise<SelfServiceOnboardingOperation>;
}
export declare function createSelfServiceOnboardingRepository(environment?: NodeJS.ProcessEnv, override?: SupabaseClient): SelfServiceOnboardingRepository;
//# sourceMappingURL=selfServiceOnboardingRepository.d.ts.map