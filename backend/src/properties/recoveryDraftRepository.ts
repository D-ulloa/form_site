import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { PlatformError } from '../platform/errors.js';
import type { OrganizationScope } from '../platform/scope.js';

export interface RecoveryDraftRow {
  id: string;
  organization_id: string;
  user_id: string;
  form_values: Record<string, unknown>;
  media_manifest: Array<Record<string, unknown>>;
  cover_file_name: string;
  status: 'open' | 'succeeded' | 'discarded';
  last_error: Record<string, unknown> | null;
  submission_id: string | null;
  property_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RecoverySnapshot {
  formValues: Record<string, unknown>;
  mediaManifest: Array<Record<string, unknown>>;
  coverFileName: string;
}

export interface RecoveryFailure {
  phase: 'validation' | 'media_validation' | 'presign' | 'upload' | 'submit' | 'unexpected';
  code: string;
  message: string;
  httpStatus?: number | undefined;
  outcome?: 'failure' | 'partial_failure' | undefined;
  steps?: Record<string, unknown> | undefined;
  submissionId?: string | undefined;
  propertyId?: string | undefined;
}

function requireRow(scope: OrganizationScope, userId: string, row: unknown): RecoveryDraftRow {
  const draft = row as RecoveryDraftRow;
  if (draft.organization_id !== scope.organization_id || draft.user_id !== userId) {
    throw new Error('RECOVERY_DRAFT_SCOPE_MISMATCH');
  }
  return draft;
}

function databaseError(error: { message: string } | null): never {
  if (error?.message.includes('RECOVERY_DRAFT_CONFLICT')) throw new PlatformError('VERSION_CONFLICT');
  throw new PlatformError('DEPENDENCY_UNAVAILABLE');
}

export function createRecoveryDraftRepository(
  clientOverride?: SupabaseClient,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const client = () => clientOverride ?? createPlatformServiceRoleClient(environment);
  const table = 'property_submission_recovery_drafts';

  return {
    async list(scope: OrganizationScope, userId: string): Promise<RecoveryDraftRow[]> {
      const { data, error } = await client().from(table).select('*')
        .eq('organization_id', scope.organization_id).eq('user_id', userId).eq('status', 'open')
        .order('updated_at', { ascending: false }).limit(50);
      if (error) databaseError(error);
      return (data ?? []).map((row) => requireRow(scope, userId, row));
    },
    async find(scope: OrganizationScope, userId: string, draftId: string): Promise<RecoveryDraftRow | null> {
      const { data, error } = await client().from(table).select('*')
        .eq('id', draftId).eq('organization_id', scope.organization_id).eq('user_id', userId)
        .maybeSingle();
      if (error) databaseError(error);
      return data ? requireRow(scope, userId, data) : null;
    },
    async create(scope: OrganizationScope, userId: string, snapshot: RecoverySnapshot): Promise<RecoveryDraftRow> {
      const { data, error } = await client().from(table).insert({
        organization_id: scope.organization_id, user_id: userId,
        form_values: snapshot.formValues, media_manifest: snapshot.mediaManifest,
        cover_file_name: snapshot.coverFileName,
      }).select('*').single();
      if (error || !data) databaseError(error);
      return requireRow(scope, userId, data);
    },
    async save(scope: OrganizationScope, userId: string, draftId: string,
      expectedVersion: number, snapshot: RecoverySnapshot): Promise<RecoveryDraftRow> {
      const { data, error } = await client().from(table).update({
        form_values: snapshot.formValues, media_manifest: snapshot.mediaManifest,
        cover_file_name: snapshot.coverFileName, updated_at: new Date().toISOString(),
        version: expectedVersion + 1,
      }).eq('id', draftId).eq('organization_id', scope.organization_id).eq('user_id', userId)
        .eq('status', 'open').eq('version', expectedVersion).select('*').maybeSingle();
      if (error) databaseError(error);
      if (!data) throw new PlatformError('VERSION_CONFLICT');
      return requireRow(scope, userId, data);
    },
    async recordFailure(scope: OrganizationScope, userId: string, draftId: string,
      expectedVersion: number, snapshot: RecoverySnapshot, failure: RecoveryFailure): Promise<RecoveryDraftRow> {
      const { data, error } = await client().rpc('record_property_submission_recovery_failure', {
        p_draft_id: draftId, p_organization_id: scope.organization_id, p_user_id: userId,
        p_expected_version: expectedVersion, p_form_values: snapshot.formValues,
        p_media_manifest: snapshot.mediaManifest, p_cover_file_name: snapshot.coverFileName,
        p_phase: failure.phase, p_code: failure.code, p_message: failure.message,
        p_http_status: failure.httpStatus ?? null, p_outcome: failure.outcome ?? null,
        p_step_results: failure.steps ?? null, p_submission_id: failure.submissionId ?? null,
        p_property_id: failure.propertyId ?? null,
      }).single();
      if (error || !data) databaseError(error);
      return requireRow(scope, userId, data);
    },
    async close(scope: OrganizationScope, userId: string, draftId: string,
      status: 'succeeded' | 'discarded', result?: { submissionId: string; propertyId: string }): Promise<void> {
      const { data, error } = await client().from(table).update({
        status, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        ...(result ? { submission_id: result.submissionId, property_id: result.propertyId } : {}),
      }).eq('id', draftId).eq('organization_id', scope.organization_id).eq('user_id', userId)
        .eq('status', 'open').select('id').maybeSingle();
      if (error) databaseError(error);
      if (!data) {
        const existing = await this.find(scope, userId, draftId);
        if (status === 'succeeded' && existing?.status === 'succeeded'
          && existing.submission_id === result?.submissionId
          && existing.property_id === result?.propertyId) return;
        throw new PlatformError('NOT_FOUND');
      }
    },
  };
}

export type RecoveryDraftRepository = ReturnType<typeof createRecoveryDraftRepository>;
