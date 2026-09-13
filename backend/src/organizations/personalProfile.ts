import { z } from 'zod';
import type { OrganizationMembershipRecord } from './types.js';

function profileText(maximum: number) {
  return z.string().trim().refine(value => {
    const length = [...value].length;
    return length >= 1 && length <= maximum && !/[\p{Cc}]/u.test(value);
  }, 'INVALID_REQUEST');
}

export const PersonalProfileSchema = z.object({
  name: profileText(120),
  contact_number: profileText(64),
  occupation: profileText(120),
}).strict();
export const InvitationAcceptanceSchema = z.object({ personal_profile: PersonalProfileSchema.optional() }).strict();
export type PersonalProfile = z.infer<typeof PersonalProfileSchema>;

/** A row returned by a privileged RPC must never become a public profile projection. */
export function publicMembership(membership: OrganizationMembershipRecord) {
  return {
    id: membership.id, organization_id: membership.organization_id, user_id: membership.user_id,
    role: membership.role, status: membership.status, joined_at: membership.joined_at,
    version: membership.version, arrangement_property_id: membership.arrangement_property_id ?? null,
  };
}
