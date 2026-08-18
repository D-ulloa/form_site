import { OrganizationDomainError } from './errors.js';
import { validateDisplayName, validateLocale, validateTimeZone } from './validation.js';

export interface UserProfileRecord {
  readonly user_id: string;
  readonly display_name: string;
  readonly locale: string;
  readonly time_zone: string;
  readonly version: number;
}

export interface UserProfileRepository {
  get(userId: string): Promise<UserProfileRecord | null>;
  update(input: {
    user_id: string;
    display_name: string;
    locale: string;
    time_zone: string;
    expected_version: number;
  }): Promise<UserProfileRecord | null>;
}

export class UserProfileService {
  constructor(private readonly repository: UserProfileRepository) {}

  async get(userId: string): Promise<UserProfileRecord> {
    const profile = await this.repository.get(userId);
    if (!profile) throw new OrganizationDomainError('NOT_FOUND');
    return profile;
  }

  async update(input: Omit<UserProfileRecord, 'user_id' | 'version'> & { expected_version: number }, userId: string) {
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
    if (!profile) throw new OrganizationDomainError('VERSION_CONFLICT');
    return profile;
  }
}

