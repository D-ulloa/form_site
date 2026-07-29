export function parseTrustProxyHops(rawValue: string | undefined): number {
  const value = rawValue?.trim();
  if (!value || !/^\d+$/u.test(value)) return 0;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
