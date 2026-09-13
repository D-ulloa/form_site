import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';

/** Signature detection and integrity checking, not a malware scanner. All downloads are attachments. */
export function createAssetContentDetector(clientOverride?: SupabaseClient, environment: NodeJS.ProcessEnv = process.env) {
  return async (bucket: string, path: string) => {
    const client = clientOverride ?? createPlatformServiceRoleClient(environment);
    const { data, error } = await client.storage.from(bucket).download(path);
    if (error || !data || data.size < 1 || data.size > 100 * 1024 * 1024) throw new Error('ASSET_VERIFICATION_UNAVAILABLE');
    const bytes = new Uint8Array(await data.arrayBuffer());
    return detectAssetBytes(bytes);
  };
}

export async function detectAssetBytes(bytes: Uint8Array) {
  const type = await fileTypeFromBuffer(bytes);
  if (!type) throw new Error('ASSET_METADATA_MISMATCH');
  return { detected_mime: type.mime, checksum_sha256: createHash('sha256').update(bytes).digest('hex') };
}
