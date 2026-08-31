import type { OrganizationScope } from './scope.js';
export declare const RATE_LIMIT_POLICIES: {
    readonly 'auth.password_login': {
        readonly window_seconds: 300;
        readonly limit: 10;
        readonly sensitive: true;
    };
    readonly 'auth.google_handoff': {
        readonly window_seconds: 300;
        readonly limit: 20;
        readonly sensitive: true;
    };
    readonly 'auth.password_recovery': {
        readonly window_seconds: 900;
        readonly limit: 5;
        readonly sensitive: true;
    };
    readonly 'auth.email_change': {
        readonly window_seconds: 3600;
        readonly limit: 3;
        readonly sensitive: true;
    };
    readonly 'auth.mfa_challenge': {
        readonly window_seconds: 300;
        readonly limit: 10;
        readonly sensitive: true;
    };
    readonly 'identity.provision': {
        readonly window_seconds: 3600;
        readonly limit: 20;
        readonly sensitive: true;
    };
    readonly 'member.invitation_create': {
        readonly window_seconds: 3600;
        readonly limit: 50;
        readonly sensitive: true;
    };
    readonly 'member.invitation_resend': {
        readonly window_seconds: 3600;
        readonly limit: 20;
        readonly sensitive: true;
    };
    readonly 'member.invitation_revoke': {
        readonly window_seconds: 3600;
        readonly limit: 20;
        readonly sensitive: true;
    };
    readonly 'member.invitation_handoff': {
        readonly window_seconds: 300;
        readonly limit: 20;
        readonly sensitive: true;
    };
    readonly 'member.invitation_resolve': {
        readonly window_seconds: 300;
        readonly limit: 30;
        readonly sensitive: true;
    };
    readonly 'member.invitation_accept': {
        readonly window_seconds: 900;
        readonly limit: 20;
        readonly sensitive: true;
    };
    readonly 'member.invitation_register': {
        readonly window_seconds: 900;
        readonly limit: 8;
        readonly sensitive: true;
    };
    readonly 'provider.invitation_webhook': {
        readonly window_seconds: 60;
        readonly limit: 120;
        readonly sensitive: true;
    };
    readonly 'contract.link_validate': {
        readonly window_seconds: 300;
        readonly limit: 30;
        readonly sensitive: true;
    };
    readonly 'contract.link_regenerate': {
        readonly window_seconds: 3600;
        readonly limit: 10;
        readonly sensitive: true;
    };
    readonly 'asset.upload_presign': {
        readonly window_seconds: 60;
        readonly limit: 30;
        readonly sensitive: true;
    };
    readonly 'asset.upload_finalize': {
        readonly window_seconds: 300;
        readonly limit: 30;
        readonly sensitive: true;
    };
    readonly 'asset.signed_view': {
        readonly window_seconds: 60;
        readonly limit: 60;
        readonly sensitive: true;
    };
    readonly 'contract.submit': {
        readonly window_seconds: 300;
        readonly limit: 20;
        readonly sensitive: true;
    };
    readonly 'contract.correct': {
        readonly window_seconds: 300;
        readonly limit: 20;
        readonly sensitive: true;
    };
    readonly 'contract.retry': {
        readonly window_seconds: 600;
        readonly limit: 10;
        readonly sensitive: true;
    };
    readonly 'property.submit': {
        readonly window_seconds: 300;
        readonly limit: 20;
        readonly sensitive: true;
    };
    readonly 'property.correct': {
        readonly window_seconds: 300;
        readonly limit: 20;
        readonly sensitive: true;
    };
    readonly 'integration.connection_test': {
        readonly window_seconds: 600;
        readonly limit: 10;
        readonly sensitive: true;
    };
    readonly 'integration.manual_retry': {
        readonly window_seconds: 600;
        readonly limit: 10;
        readonly sensitive: true;
    };
    readonly 'api_key.use_failure': {
        readonly window_seconds: 300;
        readonly limit: 20;
        readonly sensitive: true;
    };
    readonly 'api_key.rotate': {
        readonly window_seconds: 3600;
        readonly limit: 5;
        readonly sensitive: true;
    };
    readonly 'organization.export': {
        readonly window_seconds: 3600;
        readonly limit: 5;
        readonly sensitive: true;
    };
    readonly 'organization.deletion_request': {
        readonly window_seconds: 86400;
        readonly limit: 3;
        readonly sensitive: true;
    };
    readonly 'support.activate': {
        readonly window_seconds: 3600;
        readonly limit: 5;
        readonly sensitive: true;
    };
};
export type RateLimitPolicyKey = keyof typeof RATE_LIMIT_POLICIES;
export interface RateLimitDecision {
    readonly allowed: boolean;
    readonly remaining: number;
    readonly retry_after_seconds: number;
    readonly policy_key: RateLimitPolicyKey;
}
export interface DistributedRateLimitStore {
    consume(input: {
        readonly scope?: OrganizationScope;
        readonly policy_key: RateLimitPolicyKey;
        readonly subject_hash: string;
        readonly window_seconds: number;
        readonly limit: number;
        readonly cost: number;
        readonly now: Date;
    }): Promise<RateLimitDecision>;
}
export declare function createDistributedRateLimiter(store: DistributedRateLimitStore, pepper: string): {
    consume(input: {
        readonly scope?: OrganizationScope;
        readonly policy_key: RateLimitPolicyKey;
        readonly principal_type: string;
        readonly principal_id: string;
        readonly client_ip?: string;
        readonly target_id?: string;
        readonly cost?: number;
        readonly now?: Date;
    }): Promise<RateLimitDecision>;
};
//# sourceMappingURL=rateLimit.d.ts.map