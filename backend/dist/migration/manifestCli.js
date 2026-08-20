import { readFile } from 'node:fs/promises';
import { canonicalFingerprint, validateMigrationManifest } from './controlPlane.js';
const path = process.argv[2];
if (!path)
    throw new Error('Usage: npm run spec34:validate-manifest -- <manifest.json>');
const manifest = JSON.parse(await readFile(path, 'utf8'));
validateMigrationManifest(manifest);
process.stdout.write(`${JSON.stringify({ valid: true, fingerprint: canonicalFingerprint(manifest) })}\n`);
//# sourceMappingURL=manifestCli.js.map