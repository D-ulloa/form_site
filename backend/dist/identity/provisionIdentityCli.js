import { createIdentityProvisioningRepository } from './identityProvisioningRepository.js';
import { IdentityProvisioningService } from './identityProvisioningService.js';
import { createPlatformProvisioningActor, IdentityProvisioningError, } from './identityProvisioningTypes.js';
import { createSupabaseAdminAdapter } from './supabaseAdminAdapter.js';
import { validateIdentityProvisioningEnvironment } from './identityProvisioningConfig.js';
function argumentsByName(values) {
    const result = new Map();
    for (let index = 0; index < values.length; index += 2) {
        const name = values[index];
        const value = values[index + 1];
        if (!name?.startsWith('--') || !value || value.startsWith('--'))
            throw new Error('INVALID_COMMAND_ARGUMENTS');
        result.set(name.slice(2), value);
    }
    return result;
}
export async function runProvisionIdentityCommand(argv = process.argv.slice(2), environment = process.env) {
    validateIdentityProvisioningEnvironment(environment);
    const args = argumentsByName(argv);
    const purpose = args.get('purpose');
    if (purpose !== 'initial_owner' && purpose !== 'organization_invitee')
        throw new Error('INVALID_PURPOSE');
    const required = (name) => {
        const value = args.get(name)?.trim();
        if (!value)
            throw new Error(`MISSING_${name.toUpperCase().replaceAll('-', '_')}`);
        return value;
    };
    const service = new IdentityProvisioningService(createIdentityProvisioningRepository(environment), createSupabaseAdminAdapter(environment), environment);
    const result = await service.provision({
        email: required('email'), purpose: purpose,
        request_id: required('request-id'), idempotency_key: required('idempotency-key'),
        ...(args.has('display-name') ? { display_name: required('display-name') } : {}),
        ...(args.has('locale') ? { locale: required('locale') } : {}),
        ...(args.has('time-zone') ? { time_zone: required('time-zone') } : {}),
    }, createPlatformProvisioningActor({
        actor_type: 'platform_operator', user_id: required('operator-user-id'), assurance_level: 'aal2',
        step_up_reference: required('step-up-reference'),
    }));
    process.stdout.write(`${JSON.stringify(result)}\n`);
}
if (import.meta.url === `file://${process.argv[1]}`) {
    runProvisionIdentityCommand().catch((error) => {
        const message = error instanceof Error ? error.message : '';
        const code = error instanceof IdentityProvisioningError ? error.code
            : /^[A-Z][A-Z0-9_]{2,63}$/u.test(message) ? message : 'PROVISIONING_FAILED';
        process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=provisionIdentityCli.js.map