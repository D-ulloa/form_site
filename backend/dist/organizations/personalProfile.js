import { z } from 'zod';
function profileText(maximum) {
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
export const InquilinoProfileSchema = z.object({ contact_number: z.string().trim().max(64)
        .refine(value => /^\+?[0-9 ()-]+$/u.test(value) && (value.match(/[0-9]/g)?.length ?? 0) >= 7
        && (value.match(/[0-9]/g)?.length ?? 0) <= 15, 'INVALID_REQUEST') }).strict();
export const InvitationAcceptanceSchema = z.object({ personal_profile: PersonalProfileSchema.optional(),
    inquilino_profile: InquilinoProfileSchema.optional() }).strict()
    .refine(value => !(value.personal_profile && value.inquilino_profile), 'INVALID_REQUEST');
/** A row returned by a privileged RPC must never become a public profile projection. */
export function publicMembership(membership) {
    return {
        id: membership.id, organization_id: membership.organization_id, user_id: membership.user_id,
        role: membership.role, status: membership.status, joined_at: membership.joined_at,
        version: membership.version, arrangement_property_id: membership.arrangement_property_id ?? null,
    };
}
//# sourceMappingURL=personalProfile.js.map