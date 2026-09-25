export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export interface ParsedSearchInput {
  readonly value: string | null;
  readonly error: 'too_long' | null;
}

/** Empty after trim means "no filter"; overlong input stays visibly invalid. */
export function parseSearchInput(raw: string): ParsedSearchInput {
  const value = normalizeSearchText(raw);
  if (raw.length > 100 || value.length > 100) return { value: null, error: 'too_long' };
  return { value: value.length === 0 ? null : value, error: null };
}
