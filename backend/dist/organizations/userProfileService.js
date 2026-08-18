import { OrganizationDomainError } from './errors.js';
import { validateDisplayName, validateLocale, validateTimeZone } from './validation.js';
export class UserProfileService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async get(userId) {
        const profile = await this.repository.get(userId);
        if (!profile)
            throw new OrganizationDomainError('NOT_FOUND');
        return profile;
    }
    async update(input, userId) {
        if (!Number.isInteger(input.expected_version) || input.expected_version < 1) {
            throw new OrganizationDomainError('VERSION_CONFLICT');
        }
        const profile = await this.repository.update({
            user_id: userId,
            display_name: validateDisplayName(input.display_name),
            locale: validateLocale(input.locale),
            time_zone: validateTimeZone(input.time_zone),
            expected_version: input.expected_version,
        });
        if (!profile)
            throw new OrganizationDomainError('VERSION_CONFLICT');
        return profile;
    }
}
//# sourceMappingURL=userProfileService.js.map