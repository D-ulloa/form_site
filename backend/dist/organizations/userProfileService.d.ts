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
export declare class UserProfileService {
    private readonly repository;
    constructor(repository: UserProfileRepository);
    get(userId: string): Promise<UserProfileRecord>;
    update(input: Omit<UserProfileRecord, 'user_id' | 'version'> & {
        expected_version: number;
    }, userId: string): Promise<UserProfileRecord>;
}
//# sourceMappingURL=userProfileService.d.ts.map