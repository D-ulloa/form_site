import { z } from 'zod';
import { cleanupArrangementAssets } from '../src/assets/arrangementCleanup.js';
import { createSupabaseAssetStorageAdapter } from '../src/assets/storageAdapter.js';
import { createPlatformServiceRoleClient } from '../src/platform/serviceRoleClient.js';
import { createOrganizationScope } from '../src/platform/scope.js';
if (process.env.ARRANGEMENT_CLEANUP_ENABLED !== 'true') throw new Error('ARRANGEMENT_CLEANUP_ENABLED must be explicitly enabled after policy approval');
const organization = z.uuid().parse(process.argv[2]);
const client = createPlatformServiceRoleClient();
process.stdout.write(JSON.stringify(await cleanupArrangementAssets(client, createSupabaseAssetStorageAdapter(client), createOrganizationScope(organization))) + '\n');
