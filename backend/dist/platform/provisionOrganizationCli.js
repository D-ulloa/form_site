import { lstat, readFile } from 'node:fs/promises';
import { createIdentityProvisioningRepository } from '../identity/identityProvisioningRepository.js';
import { IdentityProvisioningService } from '../identity/identityProvisioningService.js';
import { createSupabaseAdminAdapter } from '../identity/supabaseAdminAdapter.js';
import { createOrganizationGovernanceRepository } from '../organizations/organizationRepository.js';
import { OrganizationService } from '../organizations/organizationService.js';
import { ORGANIZATION_PROVISIONING_MANIFEST_MAX_BYTES, parseOrganizationProvisioningManifest } from './organizationProvisioningManifest.js';
import { createOrganizationProvisioningRepository } from './organizationProvisioningRepository.js';
import { OrganizationProvisioningService } from './organizationProvisioningService.js';
import { OrganizationProvisioningError } from './organizationProvisioningTypes.js';
function parseArguments(argv) {
    let manifest;
    let operationId;
    let expectedFingerprint;
    let execute = false;
    let status = false;
    const seen = new Set();
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (!argument || seen.has(argument))
            throw new Error('INVALID_COMMAND_ARGUMENTS');
        seen.add(argument);
        if (argument === '--execute') {
            execute = true;
            continue;
        }
        if (argument === '--status') {
            status = true;
            continue;
        }
        const value = argv[index + 1];
        if (!value || value.startsWith('--'))
            throw new Error('INVALID_COMMAND_ARGUMENTS');
        if (argument === '--manifest')
            manifest = value;
        else if (argument === '--operation-id')
            operationId = value;
        else if (argument === '--expected-fingerprint')
            expectedFingerprint = value;
        else
            throw new Error('INVALID_COMMAND_ARGUMENTS');
        index += 1;
    }
    if (status !== Boolean(operationId) || (status && (manifest || execute || expectedFingerprint))
        || (!status && (!manifest || operationId)) || (!execute && expectedFingerprint)
        || (execute && !expectedFingerprint))
        throw new Error('INVALID_COMMAND_ARGUMENTS');
    return { ...(manifest ? { manifest } : {}), ...(operationId ? { operationId } : {}),
        ...(expectedFingerprint ? { expectedFingerprint } : {}), execute, status };
}
async function readRestrictedManifest(path) {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > ORGANIZATION_PROVISIONING_MANIFEST_MAX_BYTES) {
        throw new OrganizationProvisioningError('INVALID_MANIFEST');
    }
    if ((metadata.mode & 0o077) !== 0)
        throw new OrganizationProvisioningError('FORBIDDEN');
    return readFile(path, 'utf8');
}
export async function runProvisionOrganizationCommand(argv = process.argv.slice(2), environment = process.env) {
    const args = parseArguments(argv);
    const admin = createSupabaseAdminAdapter(environment);
    const service = new OrganizationProvisioningService(createOrganizationProvisioningRepository(environment), new IdentityProvisioningService(createIdentityProvisioningRepository(environment), admin, environment), admin, new OrganizationService(createOrganizationGovernanceRepository(environment)), environment);
    const output = args.status
        ? await service.status(args.operationId ?? '')
        : args.execute
            ? await service.execute(parseOrganizationProvisioningManifest(await readRestrictedManifest(args.manifest ?? '')), args.expectedFingerprint ?? '')
            : await service.dryRun(parseOrganizationProvisioningManifest(await readRestrictedManifest(args.manifest ?? '')));
    process.stdout.write(`${JSON.stringify(output)}\n`);
}
if (import.meta.url === `file://${process.argv[1]}`) {
    runProvisionOrganizationCommand().catch((error) => {
        const message = error instanceof Error ? error.message : '';
        const code = error instanceof OrganizationProvisioningError ? error.code
            : /^[A-Z][A-Z0-9_]{2,63}$/u.test(message) ? message : 'PROVISIONING_FAILED';
        process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=provisionOrganizationCli.js.map