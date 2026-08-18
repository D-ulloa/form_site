import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContractAuthenticationError,
  authenticateContractRequest,
} from '../../src/services/contractAuth.js';

test('trusted gateway identity takes precedence over forwarded authorization', () => {
  for (const authorization of [
    'Bearer unrelated-end-user-token',
    'Basic malformed-forwarded-token',
    'Bearer',
  ]) {
    const principal = authenticateContractRequest(
      {
        authorization,
        authenticatedUserId: 'gateway-user',
        developmentUserId: 'dev-user',
      },
      {
        NODE_ENV: 'production',
        CONTRACTS_API_KEY: 'different-api-key',
        CONTRACT_TRUSTED_GATEWAY_ENABLED: 'true',
      },
    );
    assert.deepEqual(principal, { mode: 'gateway', userId: 'gateway-user' });
  }
});

test('X-User-Id fails closed unless NODE_ENV is exactly development', () => {
  for (const environment of [
    {},
    { NODE_ENV: 'test' },
    { NODE_ENV: 'production' },
    { NODE_ENV: 'Development' },
  ]) {
    assert.throws(
      () => authenticateContractRequest(
        {
          authorization: undefined,
          authenticatedUserId: undefined,
          developmentUserId: 'dev-user',
        },
        environment,
      ),
      ContractAuthenticationError,
    );
  }

  assert.deepEqual(
    authenticateContractRequest(
      {
        authorization: undefined,
        authenticatedUserId: undefined,
        developmentUserId: 'dev-user',
      },
      { NODE_ENV: 'development' },
    ),
    { mode: 'development', userId: 'dev-user' },
  );
});
