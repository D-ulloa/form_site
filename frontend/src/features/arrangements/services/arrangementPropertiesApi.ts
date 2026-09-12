import axios from 'axios';
import { z } from 'zod';

const prefix = import.meta.env.DEV ? '' : '/_/backend';
const Property = z.object({ id: z.uuid(), name: z.string().min(1).max(200) }).strict();
const Member = z.object({ id: z.uuid(), display_name: z.string(), role: z.enum(['owner', 'admin', 'member', 'viewer', 'inquilino']),
  status: z.enum(['active', 'suspended', 'removed']), version: z.number().int().positive() }).strict();
const Invitation = z.object({ id: z.uuid(), email_masked: z.string(), status: z.enum(['pending', 'accepted', 'revoked', 'replaced', 'expired']),
  expires_at: z.string(), version: z.number().int().positive() }).strict();
const Receipt = z.object({ invitation_id: z.uuid(), status: z.string(), delivery_state: z.string(), delivery_method: z.literal('share_link'),
  expires_at: z.string(), next_action: z.enum(['copy_or_revoke', 'rotate_or_revoke', 'none']),
  arrangement_property_id: z.uuid(), share_url: z.url().optional() }).strict();
export type ArrangementProperty = z.infer<typeof Property>;
export type ArrangementMember = z.infer<typeof Member>;
export type ArrangementInvitation = z.infer<typeof Invitation>;
export type PropertyInvitationReceipt = z.infer<typeof Receipt>;
interface Collections { properties: ArrangementProperty; inquilinos: ArrangementMember; available: ArrangementMember; invitations: ArrangementInvitation }
export type PropertyCollection = keyof Collections;

function base(organizationId: string) { return `${prefix}/api/organizations/${encodeURIComponent(organizationId)}`; }
function csrf() {
  const token = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('form_site_csrf='));
  return token ? { 'X-CSRF-Token': decodeURIComponent(token.slice('form_site_csrf='.length)) } : {};
}
export function arrangementError(error: unknown): string {
  const raw = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
  const code = typeof raw === 'string' ? raw : raw?.code;
  const messages: Record<string, string> = {
    INVALID_REQUEST: 'Revisá los datos ingresados.', PROPERTY_REQUIRED: 'Elegí una propiedad desde Gestión de arreglos.',
    PROPERTY_CONFLICT: 'Este inquilino ya está asociado a otra propiedad.',
    ALREADY_A_MEMBER: 'La persona ya es miembro de esta organización. Si es inquilino sin propiedad, usá Asociar existente.',
    INVITATION_ALREADY_PENDING: 'Ya hay una invitación pendiente para este correo. Revocala antes de elegir otra propiedad.',
    IDEMPOTENCY_CONFLICT: 'El intento anterior tenía otros datos. Cerrá el formulario y volvé a intentarlo.',
    VERSION_CONFLICT: 'El miembro cambió. Actualizá la lista antes de volver a asociarlo.',
    ASSOCIATION_UNAVAILABLE: 'La membresía ya no está disponible para asociar. Actualizá la lista.',
    RATE_LIMITED: 'Hubo demasiados intentos. Esperá unos momentos.',
    INVITATION_INVALID: 'La invitación ya no está disponible. Actualizá la lista.',
  };
  return messages[code] ?? 'No se pudo completar la operación. Volvé a intentar.';
}
export async function listArrangementCollection<C extends PropertyCollection>(input: {
  organizationId: string; collection: C; propertyId: string | null; cursor: string | null; signal: AbortSignal;
}): Promise<{ items: Collections[C][]; next_cursor: string | null }> {
  const path = input.collection === 'properties' ? '/properties' : input.collection === 'available' ? '/inquilinos/available'
    : `/properties/${encodeURIComponent(input.propertyId!)}/${input.collection}`;
  const { data } = await axios.get(`${base(input.organizationId)}/arrangements${path}`, {
    withCredentials: true, signal: input.signal, params: { limit: 25, ...(input.cursor ? { cursor: input.cursor } : {}) },
  });
  const item = input.collection === 'properties' ? Property : input.collection === 'invitations' ? Invitation : Member;
  const page = z.object({ organization_id: z.literal(input.organizationId), items: z.array(item).max(100), next_cursor: z.string().nullable() }).strict().parse(data);
  return { items: page.items as Collections[C][], next_cursor: page.next_cursor };
}
export async function createArrangementProperty(organizationId: string, name: string, key: string, signal: AbortSignal) {
  const { data } = await axios.post(`${base(organizationId)}/arrangements/properties`, { name },
    { withCredentials: true, signal, headers: { ...csrf(), 'Idempotency-Key': key } });
  return Property.parse(data);
}
export async function associateArrangementInquilino(organizationId: string, propertyId: string, member: ArrangementMember, signal: AbortSignal) {
  const { data } = await axios.post(`${base(organizationId)}/arrangements/properties/${encodeURIComponent(propertyId)}/inquilinos`,
    { membership_id: member.id, expected_version: member.version }, { withCredentials: true, signal, headers: csrf() });
  return z.object({ id: z.literal(member.id), version: z.number().int().positive(), arrangement_property_id: z.literal(propertyId) }).strict().parse(data);
}
function receipt(data: unknown, propertyId: string) {
  const parsed = Receipt.parse(data);
  if (parsed.arrangement_property_id !== propertyId) throw new Error('INVALID_RECEIPT');
  if (parsed.share_url) {
    const url = new URL(parsed.share_url);
    if (url.origin !== window.location.origin || url.pathname !== '/invitations/accept' || !url.hash.startsWith('#invitation_token=')) throw new Error('INVALID_RECEIPT');
  }
  return parsed;
}
export async function inviteArrangementInquilino(organizationId: string, propertyId: string, email: string, key: string, signal: AbortSignal) {
  const { data } = await axios.post(`${base(organizationId)}/arrangements/properties/${encodeURIComponent(propertyId)}/invitations`, { email },
    { withCredentials: true, signal, headers: { ...csrf(), 'Idempotency-Key': key } });
  return receipt(data, propertyId);
}
export async function rotateArrangementInvitation(organizationId: string, propertyId: string, invitationId: string, signal: AbortSignal) {
  const { data } = await axios.post(`${base(organizationId)}/invitations/${encodeURIComponent(invitationId)}/rotate-link`, {},
    { withCredentials: true, signal, headers: csrf() });
  return receipt(data, propertyId);
}
export async function revokeArrangementInvitation(organizationId: string, invitationId: string, signal: AbortSignal) {
  await axios.post(`${base(organizationId)}/invitations/${encodeURIComponent(invitationId)}/revoke`, {},
    { withCredentials: true, signal, headers: csrf() });
}
