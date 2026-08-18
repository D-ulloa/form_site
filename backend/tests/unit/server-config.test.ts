import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseTrustProxyHops,
  validateContainmentEnvironment,
} from '../../src/utils/serverConfig.js';

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

test('SPEC-25 rejects insecure compatibility switches outside development', () => {
  for (const switchName of [
    'CONTRACT_ALLOW_INSECURE_AGENT_ID',
    'VITE_CONTRACT_ALLOW_INSECURE_AGENT_ID',
    'CONTRACT_ALLOW_SYNTHETIC_REGISTRATION',
  ]) {
    assert.throws(
      () => validateContainmentEnvironment({
        NODE_ENV: 'production',
        [switchName]: 'true',
      }),
      /SPEC-25 containment/u,
    );
  }
  assert.doesNotThrow(() => validateContainmentEnvironment({
    NODE_ENV: 'development',
    CONTRACT_ALLOW_SYNTHETIC_REGISTRATION: 'true',
  }));
});
