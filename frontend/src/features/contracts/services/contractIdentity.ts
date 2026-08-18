export interface ContractIdentityEnvironment {
  readonly development: boolean;
}

function currentContractIdentityEnvironment(): ContractIdentityEnvironment {
  return {
    development: import.meta.env.DEV,
  };
}

export function contractIdentityHeaders(
  userId?: string,
  environment: ContractIdentityEnvironment =
    currentContractIdentityEnvironment(),
): Record<string, string> | undefined {
  if (
    !userId
    || !environment.development
  ) {
    return undefined;
  }

  return { 'X-User-Id': userId };
}

export function contractAdminPath(entryId: string): string {
  return `/contracts/admin/${encodeURIComponent(entryId)}`;
}
