import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditRepository } from './audit.js';
import type { DistributedRateLimitStore } from './rateLimit.js';
import type { UsageRepository } from './usage.js';
export declare function createPlatformRepository(clientOverride?: SupabaseClient, environment?: NodeJS.ProcessEnv): AuditRepository & DistributedRateLimitStore & UsageRepository;
//# sourceMappingURL=platformRepository.d.ts.map