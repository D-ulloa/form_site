import { z } from 'zod';
import type { OrganizationMembershipRecord } from './types.js';
export declare const PersonalProfileSchema: z.ZodObject<{
    name: z.ZodString;
    contact_number: z.ZodString;
    occupation: z.ZodString;
}, z.core.$strict>;
export declare const InquilinoProfileSchema: z.ZodObject<{
    contact_number: z.ZodString;
}, z.core.$strict>;
export type InquilinoProfile = z.infer<typeof InquilinoProfileSchema>;
export declare const InvitationAcceptanceSchema: z.ZodObject<{
    personal_profile: z.ZodOptional<z.ZodObject<{
        name: z.ZodString;
        contact_number: z.ZodString;
        occupation: z.ZodString;
    }, z.core.$strict>>;
    inquilino_profile: z.ZodOptional<z.ZodObject<{
        contact_number: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type PersonalProfile = z.infer<typeof PersonalProfileSchema>;
/** A row returned by a privileged RPC must never become a public profile projection. */
export declare function publicMembership(membership: OrganizationMembershipRecord): {
    id: string;
    organization_id: string;
    user_id: string;
    role: import("./types.js").OrganizationRole;
    status: import("./types.js").MembershipStatus;
    joined_at: string;
    version: number;
    arrangement_property_id: string | null;
};
//# sourceMappingURL=personalProfile.d.ts.map