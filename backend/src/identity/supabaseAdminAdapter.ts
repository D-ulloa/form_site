import type { User } from '@supabase/supabase-js';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { normalizeOrganizationEmail } from '../organizations/validation.js';
import type { AuthMethod, SessionIdentity } from './types.js';

export interface ProvisioningAuthUser {
  readonly id: string;
  readonly email_normalized: string;
  readonly activation_required: boolean;
  readonly eligible: boolean;
}

export interface IdentityAdminAdapter {
  resolveByEmail(emailNormalized: string): Promise<readonly ProvisioningAuthUser[]>;
  createInviteOnly(emailNormalized: string): Promise<ProvisioningAuthUser>;
}

/** Additional Auth-admin surface used only by SPEC-41's public onboarding service. */
export interface SelfServiceIdentityAdminAdapter extends IdentityAdminAdapter {
  createPassword(emailNormalized: string, password: string, displayName: string): Promise<SessionIdentity>;
  sessionIdentity(userId: string, method: AuthMethod): Promise<SessionIdentity>;
}

export class IdentityProviderUnavailableError extends Error {
  constructor() { super('IDENTITY_PROVIDER_UNAVAILABLE'); this.name = 'IdentityProviderUnavailableError'; }
}

export class IdentityProviderAmbiguousError extends Error {
  constructor() { super('IDENTITY_PROVIDER_AMBIGUOUS'); this.name = 'IdentityProviderAmbiguousError'; }
}

function project(user: User): ProvisioningAuthUser | null {
  if (!user.email) return null;
  const extra = user as User & { deleted_at?: string | null };
  return {
    id: user.id,
    email_normalized: normalizeOrganizationEmail(user.email),
    activation_required: !(user.email_confirmed_at ?? user.confirmed_at),
    eligible: (!user.banned_until || new Date(user.banned_until).getTime() <= Date.now()) && !extra.deleted_at,
  };
}

function sessionIdentity(user: User, method: AuthMethod): SessionIdentity {
  const projected = project(user);
  if (!projected) throw new IdentityProviderUnavailableError();
  const fullName = user.user_metadata?.full_name;
  return {
    user_id: projected.id,
    email: projected.email_normalized,
    display_name: typeof fullName === 'string' && fullName.trim() ? fullName.trim().slice(0, 256) : projected.email_normalized,
    auth_method: method,
    assurance_level: 'aal1',
  };
}

/** The only Auth Admin surface exposed to provisioning code. */
export function createSupabaseAdminAdapter(environment: NodeJS.ProcessEnv = process.env): SelfServiceIdentityAdminAdapter {
  const client = createPlatformServiceRoleClient(environment);
  return {
    async resolveByEmail(emailNormalized) {
      const matches: ProvisioningAuthUser[] = [];
      for (let page = 1; page <= 100; page += 1) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new IdentityProviderUnavailableError();
        for (const raw of data.users) {
          const user = project(raw);
          if (user?.email_normalized === emailNormalized) matches.push(user);
        }
        if (data.users.length < 1000) return matches;
      }
      // A truncated provider inventory cannot prove uniqueness.
      throw new IdentityProviderAmbiguousError();
    },

    async createInviteOnly(emailNormalized) {
      const { data, error } = await client.auth.admin.createUser({
        email: emailNormalized,
        email_confirm: false,
        user_metadata: {},
        app_metadata: {},
      });
      const user = data.user ? project(data.user) : null;
      if (error || !user) throw new IdentityProviderAmbiguousError();
      return user;
    },
    async createPassword(emailNormalized, password, displayName) {
      const { data, error } = await client.auth.admin.createUser({
        email: emailNormalized,
        password,
        // SPEC-41 explicitly makes verification informative rather than a login gate.
        email_confirm: true,
        user_metadata: { full_name: displayName },
        app_metadata: {},
      });
      if (error || !data.user) throw new IdentityProviderAmbiguousError();
      return sessionIdentity(data.user, 'password');
    },
    async sessionIdentity(userId, method) {
      const { data, error } = await client.auth.admin.getUserById(userId);
      if (error || !data.user) throw new IdentityProviderUnavailableError();
      return sessionIdentity(data.user, method);
    },
  };
}
