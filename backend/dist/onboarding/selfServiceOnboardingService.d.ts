import type { SelfServiceIdentityAdminAdapter } from '../identity/supabaseAdminAdapter.js';
import type { SessionIdentity } from '../identity/types.js';
import type { SelfServiceOnboardingRepository } from './selfServiceOnboardingRepository.js';
import { type SelfServiceOnboardingOperation, type SelfServicePasswordRegistrationInput, type SelfServiceRegistrationInput } from './selfServiceOnboardingTypes.js';
export interface CreatedSelfServiceIdentity extends SessionIdentity {
    readonly user_id: string;
}
export declare class SelfServiceOnboardingService {
    private readonly repository;
    private readonly identities;
    private readonly environment;
    constructor(repository: SelfServiceOnboardingRepository, identities: SelfServiceIdentityAdminAdapter, environment?: NodeJS.ProcessEnv);
    private defaults;
    private assertEnabled;
    private claim;
    private establish;
    registerPassword(input: SelfServicePasswordRegistrationInput, incomingRequestId?: string): Promise<{
        identity: CreatedSelfServiceIdentity;
        operation: SelfServiceOnboardingOperation;
    }>;
    startGoogle(input: SelfServiceRegistrationInput, incomingRequestId?: string): Promise<SelfServiceOnboardingOperation>;
    completeGoogle(operationId: string, identity: CreatedSelfServiceIdentity, incomingRequestId?: string): Promise<{
        identity: CreatedSelfServiceIdentity;
        operation: SelfServiceOnboardingOperation;
    }>;
    recover(operationId: string, identity: CreatedSelfServiceIdentity, incomingRequestId?: string): Promise<{
        identity: CreatedSelfServiceIdentity;
        operation: SelfServiceOnboardingOperation;
    }>;
}
//# sourceMappingURL=selfServiceOnboardingService.d.ts.map