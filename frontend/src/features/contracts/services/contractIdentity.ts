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

export function contractAdminPath(organizationSlug: string, entryId?: string): string {
  const base = "/t/" + encodeURIComponent(organizationSlug) + "/contracts/admin";
  return entryId ? base + "/" + encodeURIComponent(entryId) : base;
}
