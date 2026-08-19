import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { PlatformError } from '../platform/errors.js';
import { assertRowsInOrganization, type OrganizationScope } from '../platform/scope.js';

export interface TenantProperty {
  readonly id: string; readonly organization_id: string; readonly property_code: string;
  readonly status: 'draft' | 'active' | 'archived'; readonly current_revision_id: string | null;
  readonly open_draft_id: string | null; readonly created_by_user_id: string;
  readonly updated_by_user_id: string; readonly assigned_to_user_id: string | null;
  readonly created_at: string; readonly updated_at: string; readonly archived_at: string | null;
  readonly version: number;
}

export interface PropertyListQuery {
  readonly status?: readonly TenantProperty['status'][]; readonly search?: string;
  readonly created_by_user_id?: string; readonly assigned_to_user_id?: string;
  readonly cursor?: { readonly updated_at: string; readonly id: string }; readonly limit: number;
}

export interface PropertyDraftActor {
  readonly user_id: string;
  readonly membership_id: string;
  readonly name: string;
  readonly email: string;
}

export interface CreatePropertyDraftInput {
  readonly schema_version: string;
  readonly partial_payload: Readonly<Record<string, unknown>>;
  readonly idempotency_key: string;
  readonly request_fingerprint: string;
  readonly request_id: string;
  readonly expires_at: string;
  readonly actor: PropertyDraftActor;
}

function assertScopedRow(scope: OrganizationScope, data: unknown): Readonly<Record<string, unknown>> {
  const row = data as Record<string, unknown> & { organization_id?: string };
  if (row.organization_id !== scope.organization_id) throw new Error('ORGANIZATION_SCOPE_MISMATCH');
  return row;
}

function databaseFailure(error: { message: string } | null, data?: unknown): never {
  const message = error?.message ?? (!data ? 'NO_DATA' : 'DATABASE_FAILURE');
  if (message.includes('NOT_FOUND')) throw new PlatformError('NOT_FOUND');
  if (message.includes('VERSION_CONFLICT') || message.includes('DRAFT_STATE_CONFLICT')) throw new PlatformError('VERSION_CONFLICT');
  if (message.includes('IDEMPOTENCY_CONFLICT')) throw new PlatformError('IDEMPOTENCY_CONFLICT');
  throw new PlatformError('DEPENDENCY_UNAVAILABLE');
}

export function createMultiTenantPropertyRepository(
  clientOverride?: SupabaseClient,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const client = () => clientOverride ?? createPlatformServiceRoleClient(environment);
  return {
    async createDraft(scope: OrganizationScope, input: CreatePropertyDraftInput) {
      const { data, error } = await client().rpc('spec30_create_property_draft', {
        p_organization_id: scope.organization_id,
        p_schema_version: input.schema_version,
        p_partial_payload: input.partial_payload,
        p_idempotency_key: input.idempotency_key,
        p_request_fingerprint: input.request_fingerprint,
        p_request_id: input.request_id,
        p_actor_user_id: input.actor.user_id,
        p_actor_membership_id: input.actor.membership_id,
        p_actor_name: input.actor.name,
        p_actor_email: input.actor.email,
        p_expires_at: input.expires_at,
      }).single();
      if (error || !data) databaseFailure(error, data);
      return assertScopedRow(scope, data);
    },
    async updateDraft(scope: OrganizationScope, input: Readonly<Record<string, unknown>>) {
      const { data, error } = await client().rpc('spec30_update_property_draft', {
        p_organization_id: scope.organization_id, ...input,
      }).single();
      if (error || !data) databaseFailure(error, data);
      return assertScopedRow(scope, data);
    },
    async createEditDraft(scope: OrganizationScope, input: Readonly<Record<string, unknown>>) {
      const { data, error } = await client().rpc('spec30_create_edit_draft', {
        p_organization_id: scope.organization_id, ...input,
      }).single();
      if (error || !data) databaseFailure(error, data);
      return assertScopedRow(scope, data);
    },
    async list(scope: OrganizationScope, input: PropertyListQuery): Promise<readonly TenantProperty[]> {
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new PlatformError('INVALID_CURSOR');
      let query = client().from('properties').select('*').eq('organization_id', scope.organization_id)
        .order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(input.limit);
      if (input.status?.length) query = query.in('status', [...input.status]);
      if (input.created_by_user_id) query = query.eq('created_by_user_id', input.created_by_user_id);
      if (input.assigned_to_user_id) query = query.eq('assigned_to_user_id', input.assigned_to_user_id);
      if (input.search?.trim()) query = query.ilike('search_text', `%${input.search.trim().replace(/[%_,()]/gu, '')}%`);
      if (input.cursor) query = query.or(`updated_at.lt.${input.cursor.updated_at},and(updated_at.eq.${input.cursor.updated_at},id.lt.${input.cursor.id})`);
      const { data, error } = await query;
      if (error) databaseFailure(error);
      return assertRowsInOrganization(scope, (data ?? []) as unknown as TenantProperty[]);
    },
    async findById(scope: OrganizationScope, propertyId: string): Promise<TenantProperty | null> {
      const { data, error } = await client().from('properties').select('*')
        .eq('organization_id', scope.organization_id).eq('id', propertyId).maybeSingle();
      if (error) databaseFailure(error);
      if (!data) return null;
      return assertRowsInOrganization(scope, [data as unknown as TenantProperty])[0] ?? null;
    },
    async history(scope: OrganizationScope, propertyId: string) {
      const { data, error } = await client().from('property_revisions').select([
        'id', 'organization_id', 'property_id', 'revision_number', 'previous_revision_id',
        'schema_version', 'change_kind', 'change_summary', 'created_by_actor_type',
        'created_by_user_id', 'actor_name_snapshot', 'created_at', 'request_id',
      ].join(',')).eq('organization_id', scope.organization_id).eq('property_id', propertyId)
        .order('revision_number', { ascending: false });
      if (error) databaseFailure(error);
      return assertRowsInOrganization(scope, (data ?? []) as unknown as Array<Record<string, unknown> & { organization_id: string }>);
    },
    async submitDraft(scope: OrganizationScope, input: Readonly<Record<string, unknown>>) {
      const { data, error } = await client().rpc('spec30_finalize_property_draft', {
        p_organization_id: scope.organization_id, ...input,
      }).single();
      if (error || !data) databaseFailure(error, data);
      return assertScopedRow(scope, data);
    },
    async transition(scope: OrganizationScope, input: Readonly<Record<string, unknown>>) {
      const { data, error } = await client().rpc('spec30_transition_property', {
        p_organization_id: scope.organization_id, ...input,
      }).single();
      if (error || !data) databaseFailure(error, data);
      return assertRowsInOrganization(scope, [data as unknown as TenantProperty])[0]!;
    },
    async retryRun(scope: OrganizationScope, input: Readonly<Record<string, unknown>>) {
      const { data, error } = await client().rpc('spec30_retry_property_run', {
        p_organization_id: scope.organization_id, ...input,
      }).single();
      if (error || !data) databaseFailure(error, data);
      return assertScopedRow(scope, data);
    },
    async findRun(scope: OrganizationScope, runId: string) {
      const { data, error } = await client().from('property_submission_runs').select([
        'id', 'organization_id', 'property_id', 'revision_id', 'retry_of_run_id',
        'run_kind', 'state', 'attempt_count', 'available_at', 'started_at', 'finished_at',
        'error_code', 'error_summary', 'retriable', 'request_id', 'created_at', 'updated_at', 'version',
      ].join(',')).eq('organization_id', scope.organization_id).eq('id', runId).maybeSingle();
      if (error) databaseFailure(error);
      if (!data) return null;
      return assertScopedRow(scope, data);
    },
    async runSteps(scope: OrganizationScope, runId: string) {
      const { data, error } = await client().from('property_submission_run_steps').select([
        'id', 'organization_id', 'run_id', 'property_id', 'revision_id', 'step_key',
        'state', 'attempt_count', 'safe_external_id', 'error_code', 'error_summary',
        'retriable', 'started_at', 'finished_at', 'version',
      ].join(',')).eq('organization_id', scope.organization_id).eq('run_id', runId)
        .order('created_at', { ascending: true });
      if (error) databaseFailure(error);
      return assertRowsInOrganization(scope, (data ?? []) as unknown as Array<
        Record<string, unknown> & { organization_id: string }
      >);
    },
  };
}
