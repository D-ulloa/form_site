import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTrustProxyHops } from '../../src/utils/serverConfig.js';

test('TRUST_PROXY_HOPS accepts only safe nonnegative integers', () => {
  assert.equal(parseTrustProxyHops(undefined), 0);
  assert.equal(parseTrustProxyHops(''), 0);
  assert.equal(parseTrustProxyHops('0'), 0);
  assert.equal(parseTrustProxyHops(' 2 '), 2);
  assert.equal(parseTrustProxyHops('001'), 1);
  assert.equal(parseTrustProxyHops('-1'), 0);
  assert.equal(parseTrustProxyHops('1.5'), 0);
  assert.equal(parseTrustProxyHops('not-a-number'), 0);
  assert.equal(parseTrustProxyHops(String(Number.MAX_SAFE_INTEGER + 1)), 0);
});
