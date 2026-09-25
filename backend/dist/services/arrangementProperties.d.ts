import { z } from 'zod';
import type { OrganizationScope } from '../platform/scope.js';
import type { OrganizationActorContext, OrganizationCapability } from '../organizations/types.js';
import type { ArrangementPropertyRepository, PropertyCollection, PropertyItem } from '../arrangements/arrangementPropertyRepository.js';
export declare const PropertyNameInput: z.ZodObject<{
    name: z.ZodString;
}, z.core.$strict>;
export declare const IdempotencyKey: z.ZodString;
export declare function requireArrangementAuthority(scope: OrganizationScope, actor: OrganizationActorContext, ...capabilities: OrganizationCapability[]): void;
export declare function createArrangementPropertiesService(repository: ArrangementPropertyRepository, environment?: NodeJS.ProcessEnv): {
    list(scope: OrganizationScope, actor: OrganizationActorContext, collection: PropertyCollection, propertyId: string | null, raw: unknown): Promise<{
        organization_id: string;
        items: PropertyItem[];
        next_cursor: string | null;
    }>;
    create(scope: OrganizationScope, actor: OrganizationActorContext, body: unknown, key: unknown): Promise<{
        id: string;
        name: string;
    }>;
    associate(scope: OrganizationScope, actor: OrganizationActorContext, propertyId: string, body: unknown): Promise<{
        id: string;
        version: number;
        arrangement_property_id: string;
    }>;
};
//# sourceMappingURL=arrangementProperties.d.ts.map