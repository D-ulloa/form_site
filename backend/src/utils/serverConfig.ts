export function createCorsOriginValidator(allowedOrigins: ReadonlySet<string>) {
  return (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void): void => {
    // Same-origin GETs and server requests can omit Origin. They need no CORS
    // headers; mutation handlers still require an approved Origin and CSRF.
    if (!origin) callback(null, false);
    else if (allowedOrigins.has(origin)) callback(null, true);
    else callback(new Error('CORS origin denied.'));
  };
}

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
