import { z } from 'zod';
import axios from 'axios';

const receipt = z.object({ invitation_id: z.uuid(), status: z.string(), delivery_state: z.string(),
  delivery_method: z.enum(['share_link', 'email']), expires_at: z.string(),
  next_action: z.enum(['copy_or_revoke', 'rotate_or_revoke', 'none', 'wait', 'resend_or_revoke']),
  share_url: z.string().optional(), arrangement_property_id: z.null().optional(),
}).strict().refine(value => value.next_action !== 'copy_or_revoke' || typeof value.share_url === 'string');
export type PersonalInvitationReceipt = z.infer<typeof receipt>;
const prefix = import.meta.env.DEV ? '' : '/_/backend';
async function mutation(organizationId: string, suffix: string, body: unknown, signal: AbortSignal, key?: string) {
  const csrf = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('form_site_csrf='));
  return axios.post(`${prefix}/api/organizations/${encodeURIComponent(organizationId)}/arrangements/personal/invitations${suffix}`, body, {
    withCredentials: true, signal, headers: { ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf.slice('form_site_csrf='.length)) } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}) },
  });
}
export async function invitePersonal(organizationId: string, email: string, key: string, signal: AbortSignal) {
  return receipt.parse((await mutation(organizationId, '', { email }, signal, key)).data);
}
export async function rotatePersonalInvitation(organizationId: string, id: string, signal: AbortSignal) {
  return receipt.parse((await mutation(organizationId, `/${encodeURIComponent(id)}/rotate-link`, {}, signal)).data);
}
export async function revokePersonalInvitation(organizationId: string, id: string, signal: AbortSignal) {
  await mutation(organizationId, `/${encodeURIComponent(id)}/revoke`, {}, signal);
}
