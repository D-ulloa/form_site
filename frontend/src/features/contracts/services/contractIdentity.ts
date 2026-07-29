export interface ContractIdentityEnvironment {
  readonly development: boolean;
  readonly allowInsecureAgentId: boolean;
}

function currentContractIdentityEnvironment(): ContractIdentityEnvironment {
  return {
    development: import.meta.env.DEV,
    allowInsecureAgentId:
      import.meta.env.VITE_CONTRACT_ALLOW_INSECURE_AGENT_ID === 'true',
  };
}

export function contractIdentityHeaders(
  userId?: string,
  environment: ContractIdentityEnvironment =
    currentContractIdentityEnvironment(),
): Record<string, string> | undefined {
  if (
    !userId
    || (!environment.development && !environment.allowInsecureAgentId)
  ) {
    return undefined;
  }

  return { 'X-User-Id': userId };
}
