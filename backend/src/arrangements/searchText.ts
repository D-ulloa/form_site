import { z } from 'zod';

const SearchInput = z.string().max(100);

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Empty after trim means "no filter". Throws ZodError for invalid input. */
export function parseSearch(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = SearchInput.safeParse(raw);
  if (!parsed.success) throw new z.ZodError(parsed.error.issues);
  const value = normalizeSearchText(parsed.data);
  return value.length === 0 ? null : value;
}

/** needle must already be normalizeSearchText output. */
export function searchMatches(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  if (!haystack) return false;
  return normalizeSearchText(haystack).includes(needle);
}
