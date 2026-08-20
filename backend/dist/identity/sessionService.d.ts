import type { Request } from 'express';
import type { OrganizationCapability } from '../organizations/types.js';
import type { IdentityRepository } from './identityRepository.js';
import type { AppSessionRecord, OrganizationApiKeyRecord, OrganizationRequestContext, OrganizationApiKeyContext, SessionIdentity, SessionMembershipSummary, SessionTokenMaterial } from './types.js';
export declare function ipMatchesRestriction(ip: string, restriction: string): boolean;
export interface CreatedSession {
    readonly session: AppSessionRecord;
    readonly material: SessionTokenMaterial;
    readonly identity: SessionIdentity;
    readonly max_age_seconds: number;
}
export declare class SessionService {
    private readonly repository;
    private readonly environment;
    private readonly now;
    constructor(repository: IdentityRepository, environment?: NodeJS.ProcessEnv, now?: () => Date);
    create(identity: SessionIdentity, remembered: boolean, request: Request): Promise<CreatedSession>;
    authenticate(request: Request, touch?: boolean): Promise<{
        session: AppSessionRecord;
        identity: Awaited<ReturnType<IdentityRepository['getUser']>> & {};
    }>;
    apiKeyContext(request: Request, organizationId: string, requiredScope: string): Promise<OrganizationApiKeyContext>;
    memberships(userId: string): Promise<readonly SessionMembershipSummary[]>;
    context(request: Request, organizationIdOrSlug: string, capability?: OrganizationCapability): Promise<OrganizationRequestContext>;
    logout(request: Request): Promise<void>;
    rotate(request: Request): Promise<{
        session: AppSessionRecord;
        material: SessionTokenMaterial;
        max_age_seconds: number;
    }>;
    revokeOthers(request: Request): Promise<number>;
    listSessions(request: Request): Promise<readonly AppSessionRecord[]>;
    createApiKeyMaterial(): {
        raw: string;
        prefix: string;
        hash: string;
    };
    issueApiKey(request: Request, organizationId: string, input: {
        name: string;
        scopes: readonly string[];
        expires_at: string;
        allowed_ip_cidrs?: readonly string[];
    }): Promise<{
        raw_key: string;
        key: OrganizationApiKeyRecord;
    }>;
}
//# sourceMappingURL=sessionService.d.ts.map