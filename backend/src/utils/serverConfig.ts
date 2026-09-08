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

export function resolveTrustProxyHops(environment: NodeJS.ProcessEnv): number {
  const configured = parseTrustProxyHops(environment.TRUST_PROXY_HOPS);
  // Hosted Vercel requests always arrive through its TLS-terminating proxy.
  // Keep that hop trusted even when a copied local environment specifies 0.
  return environment.VERCEL === '1' && environment.NODE_ENV === 'production'
    ? Math.max(1, configured)
    : configured;
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
