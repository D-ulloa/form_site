import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PrivateAssetStorageAdapter } from './storageAdapter.js';
import { PlatformError } from '../platform/errors.js';
import type { OrganizationScope } from '../platform/scope.js';

/** A scheduler must invoke this explicitly per organization after approving POL-09 activation. */
export async function cleanupArrangementAssets(client: SupabaseClient, storage: PrivateAssetStorageAdapter, scope: OrganizationScope) {
  const requestId = randomUUID();
  const call = async (action: string, id: string | null, result: string | null) => {
    const response = await client.rpc('spec43_cleanup_assets', { p_organization_id: scope.organization_id, p_action: action, p_asset_id: id, p_result: result, p_request_id: requestId });
    if (response.error) throw new PlatformError('DEPENDENCY_UNAVAILABLE');
    return response.data as unknown;
  };
  const items = z.array(z.object({ id: z.uuid(), organization_id: z.literal(scope.organization_id), bucket_name: z.literal('arrangement-media'), object_path: z.string() }).strict()).max(25).parse(await call('claim', null, null));
  let deleted = 0;
  let failed = 0;
  for (const item of items) {
    let result: 'deleted' | 'not_found_reconciled' | 'failed';
    try { result = await storage.remove(item.bucket_name, item.object_path) === 'not_found' ? 'not_found_reconciled' : 'deleted'; }
    catch { result = 'failed'; }
    await call('complete', item.id, result);
    if (result === 'failed') failed++; else deleted++;
  }
  return { organization_id: scope.organization_id, deleted, failed, has_more: items.length === 25 };
}
