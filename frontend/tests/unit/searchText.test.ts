// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { normalizeSearchText, parseSearchInput } from '../../src/features/arrangements/utils/searchText';

describe('SPEC-47 frontend search normalization', () => {
  it('folds case, trim, NFKC and combining marks', () => {
    expect(normalizeSearchText('  Casa  ')).toBe('casa');
    expect(normalizeSearchText('CAFÉ')).toBe('cafe');
    expect(normalizeSearchText('Cafe\u0301')).toBe('cafe');
    expect(normalizeSearchText('ＣＡＳＡ')).toBe('casa');
    expect(parseSearchInput('')).toEqual({ value: null, error: null });
    expect(parseSearchInput('   ')).toEqual({ value: null, error: null });
    expect(parseSearchInput('Ávila')).toEqual({ value: 'avila', error: null });
    expect(parseSearchInput('a'.repeat(100))).toEqual({ value: 'a'.repeat(100), error: null });
    expect(parseSearchInput('a'.repeat(101))).toEqual({ value: null, error: 'too_long' });
  });
});
