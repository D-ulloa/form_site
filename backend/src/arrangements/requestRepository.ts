import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { PlatformError } from '../platform/errors.js';
import type { OrganizationScope } from '../platform/scope.js';
import type { OrganizationActorContext } from '../organizations/types.js';

export const ArrangementStatus = z.enum(['open', 'in_progress', 'solved', 'archived']);
export const RequestRecord = z.object({
  id: z.uuid(), organization_id: z.uuid(), name: z.string().min(1).max(200), description: z.string().min(1).max(5000).nullable(),
  status: ArrangementStatus, property: z.object({ id: z.uuid(), name: z.string().min(1).max(200) }).strict().nullable(),
  created_at: z.iso.datetime({ offset: true }).nullable(), submitted_at: z.iso.datetime({ offset: true }).nullable(),
  updated_at: z.iso.datetime({ offset: true }).nullable(), version: z.number().int().positive(),
  legacy: z.boolean(), created_by_you: z.boolean().nullable().transform(value => value ?? false),
  assets: z.array(z.object({ id: z.uuid(), display_filename: z.string().min(1).max(120),
    mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']),
    bytes: z.number().int().positive().max(104857600) }).strict()).max(40),
}).strict();
export type ArrangementRequest = z.infer<typeof RequestRecord>;
export class ArrangementRequestError extends Error {
  constructor(readonly code: string, readonly status: number, readonly current?: { id: string; status: string; version: number }) {
    super(code);
  }
}
export interface ArrangementRequestRepository {
  call(scope: OrganizationScope, actor: OrganizationActorContext, action: string, input: Record<string, unknown>): Promise<unknown>;
}
export function createArrangementRequestRepository(clientOverride?: SupabaseClient, environment: NodeJS.ProcessEnv = process.env): ArrangementRequestRepository {
  return {
    async call(scope, actor, action, input) {
      const { data, error } = await (clientOverride ?? createPlatformServiceRoleClient(environment)).rpc('spec43_arrangements', {
        p_organization_id: scope.organization_id, p_actor_membership_id: actor.membership.id,
        p_action: action, p_input: input, p_request_id: actor.request_id,
      });
      if (error) {
        const errors: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, PROPERTY_REQUIRED: 409,
          IDEMPOTENCY_CONFLICT: 409, SESSION_INVALID: 409, DRAFT_EXPIRED: 409, UPLOAD_INCOMPLETE: 409,
          UPLOAD_INVALID: 400, INVALID_REQUEST: 400, QUOTA_EXCEEDED: 409 };
        if (Object.hasOwn(errors, error.message)) throw new ArrangementRequestError(error.message, errors[error.message]!);
        throw new PlatformError('DEPENDENCY_UNAVAILABLE');
      }
      const conflict = z.object({ error: z.literal('VERSION_CONFLICT'), current: z.object({ id: z.uuid(), status: ArrangementStatus, version: z.number().int().positive() }) }).safeParse(data);
      if (conflict.success) throw new ArrangementRequestError('VERSION_CONFLICT', 409, conflict.data.current);
      return data;
    },
  };
}
