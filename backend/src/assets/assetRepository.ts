import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { PlatformError } from '../platform/errors.js';
import { assertRowsInOrganization, type OrganizationScope } from '../platform/scope.js';
import type { InitializeAssetSessionInput, SafeAssetRecord } from './types.js';

function databaseFailure(error: { message: string } | null, data?: unknown): never {
  const message = error?.message ?? (!data ? 'NO_DATA' : 'DATABASE_FAILURE');
  if (message.includes('NOT_FOUND') || message.includes('SCOPE_MISMATCH')) throw new PlatformError('NOT_FOUND');
  if (message.includes('QUOTA_EXCEEDED')) throw new PlatformError('QUOTA_EXCEEDED');
  if (message.includes('IDEMPOTENCY_CONFLICT')) throw new PlatformError('IDEMPOTENCY_CONFLICT');
  if (message.includes('STATE_CONFLICT') || message.includes('SESSION_INVALID')) throw new PlatformError('VERSION_CONFLICT');
  throw new PlatformError('DEPENDENCY_UNAVAILABLE');
}

function assertScoped(scope: OrganizationScope, value: unknown): Readonly<Record<string, unknown>> {
  const row = value as Record<string, unknown> & { organization_id?: string };
  if (row.organization_id !== scope.organization_id) throw new Error('ORGANIZATION_SCOPE_MISMATCH');
  return row;
}

export function createAssetRepository(
  clientOverride?: SupabaseClient,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const client = () => clientOverride ?? createPlatformServiceRoleClient(environment);
  return {
    async initialize(scope: OrganizationScope, input: InitializeAssetSessionInput) {
      const { data, error } = await client().rpc('spec31_initialize_asset_upload', {
        p_organization_id: scope.organization_id, p_owner_type: input.owner_type,
        p_owner_id: input.owner_id, p_capability_key: input.capability_key,
        p_principal_type: input.principal.type, p_principal_reference_id: input.principal.reference_id,
        p_principal_fingerprint: input.principal.fingerprint, p_idempotency_key: input.idempotency_key,
        p_request_fingerprint: input.request_fingerprint, p_request_id: input.request_id,
        p_expires_at: input.expires_at, p_descriptors: input.descriptors,
      }).single();
      if (error || !data) databaseFailure(error, data);
      return assertScoped(scope, data);
    },
    async finalize(scope: OrganizationScope, input: Readonly<Record<string, unknown>>) {
      const { data, error } = await client().rpc('spec31_finalize_asset_upload', {
        p_organization_id: scope.organization_id, ...input,
      }).single();
      if (error || !data) databaseFailure(error, data);
      return assertScoped(scope, data);
    },
    async revoke(scope: OrganizationScope, uploadSessionId: string, expectedVersion: number, requestId: string) {
      const { data, error } = await client().rpc('spec31_revoke_asset_upload', {
        p_organization_id: scope.organization_id, p_upload_session_id: uploadSessionId,
        p_expected_version: expectedVersion, p_request_id: requestId,
      }).single();
      if (error || !data) databaseFailure(error, data);
      return assertScoped(scope, data);
    },
    async findSafe(scope: OrganizationScope, assetId: string): Promise<SafeAssetRecord | null> {
      const { data, error } = await client().from('asset_safe_projection').select('*')
        .eq('organization_id', scope.organization_id).eq('id', assetId).maybeSingle();
      if (error) databaseFailure(error);
      if (!data) return null;
      return assertRowsInOrganization(scope, [data as unknown as SafeAssetRecord])[0] ?? null;
    },
    async findInternal(scope: OrganizationScope, assetId: string) {
      const { data, error } = await client().from('media_assets').select('*')
        .eq('organization_id', scope.organization_id).eq('id', assetId).maybeSingle();
      if (error) databaseFailure(error);
      return data ? assertScoped(scope, data) : null;
    },
    async listSessionIntents(scope: OrganizationScope, sessionId: string) {
      const { data, error } = await client().from('asset_upload_intents').select([
        'id', 'organization_id', 'upload_session_id', 'asset_id', 'receiver_key',
        'bucket_name', 'object_path', 'state', 'version',
      ].join(',')).eq('organization_id', scope.organization_id)
        .eq('upload_session_id', sessionId).order('created_at', { ascending: true });
      if (error) databaseFailure(error);
      return assertRowsInOrganization(scope, (data ?? []) as unknown as Array<
        Record<string, unknown> & { organization_id: string }
      >);
    },
    async recordUrlIssued(scope: OrganizationScope, sessionId: string, intentId: string, expiresAt: string) {
      const { data, error } = await client().rpc('spec31_record_asset_upload_issuance', {
        p_organization_id: scope.organization_id, p_upload_session_id: sessionId,
        p_upload_intent_id: intentId, p_url_expires_at: expiresAt,
      }).single();
      if (error || !data) databaseFailure(error, data);
      assertScoped(scope, data);
    },
  };
}
