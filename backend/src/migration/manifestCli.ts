import { readFile } from 'node:fs/promises';
import { canonicalFingerprint, validateMigrationManifest } from './controlPlane.js';
import type { MigrationManifest } from './types.js';

const path = process.argv[2];
if (!path) throw new Error('Usage: npm run spec34:validate-manifest -- <manifest.json>');
const manifest = JSON.parse(await readFile(path, 'utf8')) as MigrationManifest;
validateMigrationManifest(manifest);
process.stdout.write(`${JSON.stringify({ valid: true, fingerprint: canonicalFingerprint(manifest) })}\n`);
