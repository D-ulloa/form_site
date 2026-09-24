import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { OrganizationScope } from '../platform/scope.js';
export declare const ArrangementProperty: z.ZodObject<{
    id: z.ZodUUID;
    name: z.ZodString;
}, z.core.$strict>;
export declare const ArrangementMember: z.ZodObject<{
    id: z.ZodUUID;
    display_name: z.ZodString;
    role: z.ZodEnum<{
        owner: "owner";
        admin: "admin";
        member: "member";
        viewer: "viewer";
        inquilino: "inquilino";
    }>;
    status: z.ZodEnum<{
        active: "active";
        suspended: "suspended";
        removed: "removed";
    }>;
    version: z.ZodNumber;
}, z.core.$strict>;
export declare const ArrangementInvitation: z.ZodObject<{
    id: z.ZodUUID;
    email_masked: z.ZodString;
    status: z.ZodEnum<{
        revoked: "revoked";
        pending: "pending";
        accepted: "accepted";
        replaced: "replaced";
        expired: "expired";
    }>;
    expires_at: z.ZodString;
    version: z.ZodNumber;
}, z.core.$strict>;
export type PropertyCollection = 'properties' | 'inquilinos' | 'invitations' | 'available';
export type PropertyItem = z.infer<typeof ArrangementProperty> | z.infer<typeof ArrangementMember> | z.infer<typeof ArrangementInvitation>;
export interface ArrangementPropertyRepository {
    list(scope: OrganizationScope, input: {
        actor_id: string;
        collection: PropertyCollection;
        property_id: string | null;
        after_id: string | null;
        limit: number;
    }): Promise<{
        organization_id: string;
        items: PropertyItem[];
    }>;
    create(scope: OrganizationScope, input: {
        actor_id: string;
        name: string;
        idempotency_key: string;
        request_id: string;
    }): Promise<z.infer<typeof ArrangementProperty>>;
    associate(scope: OrganizationScope, input: {
        actor_id: string;
        property_id: string;
        membership_id: string;
        expected_version: number;
        request_id: string;
    }): Promise<{
        id: string;
        version: number;
        arrangement_property_id: string;
    }>;
}
export declare function createArrangementPropertyRepository(clientOverride?: SupabaseClient, environment?: NodeJS.ProcessEnv): ArrangementPropertyRepository;
//# sourceMappingURL=arrangementPropertyRepository.d.ts.map