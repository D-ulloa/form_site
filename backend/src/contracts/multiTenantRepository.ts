import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { PlatformError } from '../platform/errors.js';
import { assertRowsInOrganization, type OrganizationScope } from '../platform/scope.js';
import type { ContractActor } from './multiTenantDomain.js';

export interface TenantContractEntry {
  readonly id: string;
  readonly organization_id: string;
  readonly schema_id: string;
  readonly direccion: string | null;
  readonly status: 'open' | 'complete' | 'generar_contrato' | 'archived';
  readonly created_by_user_id: string | null;
  readonly assigned_to_user_id: string | null;
  readonly current_user_revision_id: string | null;
  readonly current_client_revision_id: string | null;
  readonly template_version_id: string | null;
  readonly global_template_version_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

export interface ContractListQuery {
  readonly status?: readonly TenantContractEntry['status'][];
  readonly search?: string;
  readonly assigned_to_user_id?: string;
  readonly created_by_user_id?: string;
  readonly template_version_id?: string;
  readonly created_before?: string;
  readonly cursor?: { readonly created_at: string; readonly id: string };
  readonly limit: number;
}

export interface AppendRevisionInput {
  readonly entry_id: string;
  readonly role: 'user' | 'client';
  readonly expected_version: number;
  readonly submission: Readonly<Record<string, unknown>>;
  readonly reason: string;
  readonly idempotency_key: string;
  readonly request_id: string;
  readonly actor: ContractActor;
}

export interface RotateLinkInput {
  readonly entry_id: string;
  readonly role: 'user' | 'client';
  readonly expected_version: number;
  readonly token_hash: string;
  readonly token_prefix: string;
  readonly fingerprint: string;
  readonly expires_at: string;
  readonly request_id: string;
  readonly actor_membership_id: string;
}

export interface MultiTenantContractRepository {
  list(scope: OrganizationScope, query: ContractListQuery): Promise<readonly TenantContractEntry[]>;
  findById(scope: OrganizationScope, entryId: string): Promise<TenantContractEntry | null>;
  history(scope: OrganizationScope, entryId: string): Promise<readonly Readonly<Record<string, unknown>>[]>;
  appendRevision(scope: OrganizationScope, input: AppendRevisionInput): Promise<TenantContractEntry>;
  rotateLink(scope: OrganizationScope, input: RotateLinkInput): Promise<Readonly<Record<string, unknown>>>;
  revokeLink(scope: OrganizationScope, input: {
    readonly entry_id: string; readonly role: 'user' | 'client'; readonly expected_version: number;
    readonly request_id: string; readonly actor_membership_id: string;
  }): Promise<TenantContractEntry>;
}

function databaseFailure(error: { message: string } | null, data?: unknown): never {
  const message = error?.message ?? (!data ? 'NO_DATA' : 'DATABASE_FAILURE');
  if (message.includes('NOT_FOUND')) throw new PlatformError('NOT_FOUND');
  if (message.includes('VERSION_CONFLICT') || message.includes('INVALID_STATE')) {
    throw new PlatformError('VERSION_CONFLICT');
  }
  if (message.includes('IDEMPOTENCY_CONFLICT')) throw new PlatformError('IDEMPOTENCY_CONFLICT');
  throw new PlatformError('DEPENDENCY_UNAVAILABLE');
}

function actorRpc(actor: ContractActor): Readonly<Record<string, string | null>> {
  return {
    p_actor_type: actor.actor_type,
    p_actor_user_id: 'actor_user_id' in actor ? actor.actor_user_id : null,
    p_actor_membership_id: 'actor_membership_id' in actor ? actor.actor_membership_id : null,
    p_external_capability_id: 'external_capability_id' in actor ? actor.external_capability_id : null,
    p_api_key_id: 'api_key_id' in actor ? actor.api_key_id : null,
    p_support_session_id: 'support_session_id' in actor ? actor.support_session_id : null,
    p_support_reason: 'support_reason' in actor ? actor.support_reason : null,
  };
}

export function createMultiTenantContractRepository(
  clientOverride?: SupabaseClient,
  environment: NodeJS.ProcessEnv = process.env,
): MultiTenantContractRepository {
  const client = () => clientOverride ?? createPlatformServiceRoleClient(environment);
  return {
    async list(scope, input) {
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
        throw new PlatformError('INVALID_CURSOR');
      }
      let query = client().from('contract_entries').select([
        'id', 'organization_id', 'schema_id', 'direccion', 'status', 'created_by_user_id',
        'assigned_to_user_id', 'current_user_revision_id', 'current_client_revision_id',
        'template_version_id', 'global_template_version_id', 'created_at', 'updated_at', 'version',
      ].join(',')).eq('organization_id', scope.organization_id)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(input.limit);
      if (input.status?.length) query = query.in('status', [...input.status]);
      if (input.assigned_to_user_id) query = query.eq('assigned_to_user_id', input.assigned_to_user_id);
      if (input.created_by_user_id) query = query.eq('created_by_user_id', input.created_by_user_id);
      if (input.template_version_id) query = query.eq('template_version_id', input.template_version_id);
      if (input.created_before) query = query.lt('created_at', input.created_before);
      if (input.search?.trim()) query = query.ilike('direccion', `%${input.search.trim().replace(/[%_,()]/gu, '')}%`);
      if (input.cursor) {
        query = query.or(`created_at.lt.${input.cursor.created_at},and(created_at.eq.${input.cursor.created_at},id.lt.${input.cursor.id})`);
      }
      const { data, error } = await query;
      if (error) databaseFailure(error);
      return assertRowsInOrganization(scope, (data ?? []) as unknown as TenantContractEntry[]);
    },

    async findById(scope, entryId) {
      const { data, error } = await client().from('contract_entries').select('*')
        .eq('organization_id', scope.organization_id).eq('id', entryId).maybeSingle();
      if (error) databaseFailure(error);
      if (!data) return null;
      return assertRowsInOrganization(scope, [data as unknown as TenantContractEntry])[0] ?? null;
    },

    async history(scope, entryId) {
      const { data, error } = await client().from('contract_submissions').select([
        'id', 'organization_id', 'entry_id', 'role', 'revision_number', 'predecessor_submission_id',
        'actor_type', 'actor_user_id', 'actor_membership_id', 'external_capability_id',
        'api_key_id', 'support_session_id', 'request_id', 'reason', 'summary', 'submitted_at',
      ].join(',')).eq('organization_id', scope.organization_id).eq('entry_id', entryId)
        .order('role', { ascending: true }).order('revision_number', { ascending: true });
      if (error) databaseFailure(error);
      return assertRowsInOrganization(scope, (data ?? []) as unknown as Readonly<
        Record<string, unknown> & { organization_id: string }
      >[]);
    },

    async appendRevision(scope, input) {
      const { data, error } = await client().rpc('spec29_append_contract_revision', {
        p_organization_id: scope.organization_id,
        p_entry_id: input.entry_id,
        p_role: input.role,
        p_expected_version: input.expected_version,
        p_submission: input.submission,
        p_reason: input.reason,
        p_idempotency_key: input.idempotency_key,
        p_request_id: input.request_id,
        ...actorRpc(input.actor),
      }).single();
      if (error || !data) databaseFailure(error, data);
      return assertRowsInOrganization(scope, [data as unknown as TenantContractEntry])[0]!;
    },

    async rotateLink(scope, input) {
      const { data, error } = await client().rpc('spec29_rotate_contract_link', {
        p_organization_id: scope.organization_id, p_entry_id: input.entry_id, p_role: input.role,
        p_expected_version: input.expected_version, p_token_hash: input.token_hash,
        p_token_prefix: input.token_prefix, p_fingerprint: input.fingerprint,
        p_expires_at: input.expires_at, p_request_id: input.request_id,
        p_actor_membership_id: input.actor_membership_id,
      }).single();
      if (error || !data) databaseFailure(error, data);
      const row = data as Record<string, unknown> & { organization_id?: string };
      if (row.organization_id !== scope.organization_id) throw new Error('ORGANIZATION_SCOPE_MISMATCH');
      return row;
    },

    async revokeLink(scope, input) {
      const { data, error } = await client().rpc('spec29_revoke_contract_link', {
        p_organization_id: scope.organization_id, p_entry_id: input.entry_id, p_role: input.role,
        p_expected_version: input.expected_version, p_request_id: input.request_id,
        p_actor_membership_id: input.actor_membership_id,
      }).single();
      if (error || !data) databaseFailure(error, data);
      return assertRowsInOrganization(scope, [data as unknown as TenantContractEntry])[0]!;
    },
  };
}
