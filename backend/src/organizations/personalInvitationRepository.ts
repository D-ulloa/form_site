import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { mapOrganizationPersistenceError } from './errors.js';
import type { InvitationRecord } from './organizationRepository.js';

interface Scope { organization_id: string; actor_membership_id: string }
interface Token { token_hash: string; token_prefix: string; expires_at: string; request_id: string }
export interface PersonalInvitationRepository {
  prepare(input: Scope & { email: string; idempotency_key: string }): Promise<{ operation_id: string; invitation: InvitationRecord | null }>;
  create(input: Scope & Token & { operation_id: string; email: string; invited_auth_user_id: string;
    registration_permitted: boolean; delivery_method: 'share_link' | 'email' }): Promise<InvitationRecord>;
  rotate(input: Scope & Token & { invitation_id: string; replacement_invitation_id: string }): Promise<InvitationRecord>;
  revoke(input: Scope & { invitation_id: string; request_id: string }): Promise<InvitationRecord>;
}
const RecordSchema = z.object({
  id: z.uuid(), organization_id: z.uuid(), intended_role: z.literal('personal'),
  status: z.enum(['pending', 'accepted', 'revoked', 'replaced']), expires_at: z.string(),
  delivery_state: z.enum(['pending', 'accepted_by_provider', 'delivered', 'failed', 'bounced', 'complained']),
  delivery_method: z.enum(['share_link', 'email']), token_version: z.number().int().positive(), version: z.number().int().positive(),
  arrangement_property_id: z.null(), email_normalized: z.string().optional(), link_issued: z.boolean().optional(),
});
function record(data: unknown, error: { message: string } | null, organizationId: string): InvitationRecord {
  if (error) mapOrganizationPersistenceError(error);
  const parsed = RecordSchema.safeParse(data);
  if (!parsed.success || parsed.data.organization_id !== organizationId) mapOrganizationPersistenceError({ message: 'DEPENDENCY_NOT_READY' });
  const { email_normalized, link_issued, ...required } = parsed.data;
  return { ...required, ...(email_normalized === undefined ? {} : { email_normalized }),
    ...(link_issued === undefined ? {} : { link_issued }) };
}
export function createPersonalInvitationRepository(environment: NodeJS.ProcessEnv = process.env, override?: SupabaseClient): PersonalInvitationRepository {
  const client = () => override ?? createPlatformServiceRoleClient(environment);
  const scope = (input: Scope) => ({ p_organization_id: input.organization_id, p_actor_membership_id: input.actor_membership_id });
  const token = (input: Token) => ({ p_token_hash: input.token_hash, p_token_prefix: input.token_prefix,
    p_expires_at: input.expires_at, p_request_id: input.request_id });
  return {
    async prepare(input) {
      const { data, error } = await client().rpc('spec44_prepare_personal_invitation', {
        ...scope(input), p_email_normalized: input.email, p_idempotency_key: input.idempotency_key,
      });
      if (error) mapOrganizationPersistenceError(error);
      const parsed = z.object({ operation_id: z.uuid(), invitation: RecordSchema.nullable() }).strict().safeParse(data);
      if (!parsed.success) mapOrganizationPersistenceError({ message: 'DEPENDENCY_NOT_READY' });
      return { operation_id: parsed.data.operation_id,
        invitation: parsed.data.invitation ? record(parsed.data.invitation, null, input.organization_id) : null };
    },
    async create(input) {
      const { data, error } = await client().rpc('spec44_create_personal_invitation', { ...scope(input), ...token(input),
        p_operation_id: input.operation_id, p_email_normalized: input.email, p_invited_auth_user_id: input.invited_auth_user_id,
        p_registration_permitted: input.registration_permitted, p_delivery_method: input.delivery_method });
      return record(data, error, input.organization_id);
    },
    async rotate(input) {
      const { data, error } = await client().rpc('spec44_rotate_personal_invitation', { ...scope(input), ...token(input),
        p_invitation_id: input.invitation_id, p_replacement_invitation_id: input.replacement_invitation_id }).single();
      return record(data, error, input.organization_id);
    },
    async revoke(input) {
      const { data, error } = await client().rpc('spec44_revoke_personal_invitation', { ...scope(input),
        p_invitation_id: input.invitation_id, p_request_id: input.request_id }).single();
      return record(data, error, input.organization_id);
    },
  };
}
