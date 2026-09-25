import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSearchText, parseSearch, searchMatches } from '../../src/arrangements/searchText.js';

test('SPEC-47 search normalization folds case, trim, NFKC and combining marks', () => {
  assert.equal(normalizeSearchText('  Casa  '), 'casa');
  assert.equal(normalizeSearchText('CAFÉ'), 'cafe');
  assert.equal(normalizeSearchText('Cafe\u0301'), 'cafe');
  assert.equal(normalizeSearchText('ＣＡＳＡ'), 'casa');
  assert.equal(parseSearch('  '), null);
  assert.equal(parseSearch(''), null);
  assert.equal(parseSearch(undefined), null);
  assert.equal(parseSearch(null), null);
  assert.equal(parseSearch('Ávila'), 'avila');
  assert.throws(() => parseSearch('a'.repeat(101)));
  assert.throws(() => parseSearch(123));
  assert.throws(() => parseSearch(['casa']));
});

test('SPEC-47 searchMatches is normalized substring match without ID predicates', () => {
  const needle = parseSearch('cas')!;
  assert.equal(searchMatches('Casa Norte', needle), true);
  assert.equal(searchMatches('La CASA', needle), true);
  assert.equal(searchMatches('Quinta', needle), false);
  assert.equal(searchMatches(null, needle), false);
  assert.equal(searchMatches(undefined, needle), false);
  assert.equal(searchMatches('anything', ''), true);
});
