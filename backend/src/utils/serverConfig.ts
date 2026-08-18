export function parseTrustProxyHops(rawValue: string | undefined): number {
  const value = rawValue?.trim();
  if (!value || !/^\d+$/u.test(value)) return 0;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function validateContainmentEnvironment(environment: NodeJS.ProcessEnv): void {
  if (
    environment.NODE_ENV !== 'development'
    && (
      environment.CONTRACT_ALLOW_INSECURE_AGENT_ID === 'true'
      || environment.VITE_CONTRACT_ALLOW_INSECURE_AGENT_ID === 'true'
      || environment.CONTRACT_ALLOW_SYNTHETIC_REGISTRATION === 'true'
    )
  ) {
    throw new Error(
      'SPEC-25 containment forbids insecure identity or synthetic registration outside development.',
    );
  }
}
