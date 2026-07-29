import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContractAuthenticationError,
  ContractAuthorizationError,
  authenticateContractRequest,
  authorizeContractUserScope,
  type ContractAuthenticationInput,
} from '../src/services/contractAuth.js';

function headers(
  overrides: Partial<ContractAuthenticationInput> = {},
): ContractAuthenticationInput {
  return {
    authorization: undefined,
    authenticatedUserId: undefined,
    developmentUserId: undefined,
    ...overrides,
  };
}

test('a configured Bearer key authenticates as an unscoped API-key principal', () => {
  const principal = authenticateContractRequest(
    headers({ authorization: 'Bearer test-contract-key' }),
    { CONTRACTS_API_KEY: 'test-contract-key', NODE_ENV: 'production' },
  );
  assert.deepEqual(principal, { mode: 'api_key' });
  assert.doesNotThrow(() => authorizeContractUserScope(principal, 'any-user'));
});

test('malformed or unconfigured explicit Bearer authentication returns 401', () => {
  for (const fixture of [
    { authorization: 'Basic abc', environment: { CONTRACTS_API_KEY: 'expected' } },
    { authorization: 'Bearer', environment: { CONTRACTS_API_KEY: 'expected' } },
    { authorization: 'Bearer one two', environment: { CONTRACTS_API_KEY: 'expected' } },
    { authorization: 'Bearer supplied', environment: {} },
    { authorization: 'Bearer supplied', environment: { CONTRACTS_API_KEY: '   ' } },
  ]) {
    assert.throws(
      () => authenticateContractRequest(
        headers({
          authorization: fixture.authorization,
        }),
        fixture.environment,
      ),
      (error: unknown) => {
        assert.ok(error instanceof ContractAuthenticationError);
        assert.equal(error.status, 401);
        return true;
      },
    );
  }
});

test('a wrong configured Bearer key returns 403 without identity fallback', () => {
  assert.throws(
    () => authenticateContractRequest(
      headers({ authorization: 'Bearer wrong-key' }),
      { CONTRACTS_API_KEY: 'correct-key' },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ContractAuthorizationError);
      assert.equal(error.status, 403);
      return true;
    },
  );
});

test('trusted gateway identity is accepted in production and is user-scoped', () => {
  const principal = authenticateContractRequest(
    headers({ authenticatedUserId: '  gateway-user  ' }),
    { NODE_ENV: 'production' },
  );
  assert.deepEqual(principal, { mode: 'gateway', userId: 'gateway-user' });
  assert.doesNotThrow(() => authorizeContractUserScope(principal, 'gateway-user'));
  assert.throws(
    () => authorizeContractUserScope(principal, 'different-user'),
    ContractAuthorizationError,
  );
});

test('development identity works only in development and production fails closed', () => {
  const principal = authenticateContractRequest(
    headers({ developmentUserId: 'dev-user' }),
    { NODE_ENV: 'development' },
  );
  assert.deepEqual(principal, { mode: 'development', userId: 'dev-user' });
  assert.doesNotThrow(() => authorizeContractUserScope(principal, 'dev-user'));

  assert.throws(
    () => authenticateContractRequest(
      headers({ developmentUserId: 'dev-user' }),
      { NODE_ENV: 'production' },
    ),
    ContractAuthenticationError,
  );
});

test('hosted agent identity requires the exact insecure opt-in flag', () => {
  const principal = authenticateContractRequest(
    headers({ developmentUserId: '  hosted-agent  ' }),
    {
      NODE_ENV: 'production',
      CONTRACT_ALLOW_INSECURE_AGENT_ID: 'true',
    },
  );
  assert.deepEqual(principal, {
    mode: 'insecure_agent',
    userId: 'hosted-agent',
  });
  assert.doesNotThrow(() =>
    authorizeContractUserScope(principal, 'hosted-agent'));
  assert.throws(
    () => authorizeContractUserScope(principal, 'different-agent'),
    ContractAuthorizationError,
  );

  for (const value of ['false', 'TRUE', '1', ' true ', '']) {
    assert.throws(
      () => authenticateContractRequest(
        headers({ developmentUserId: 'hosted-agent' }),
        {
          NODE_ENV: 'production',
          CONTRACT_ALLOW_INSECURE_AGENT_ID: value,
        },
      ),
      ContractAuthenticationError,
    );
  }
});

test('missing or malformed identity headers cannot authenticate or downgrade', () => {
  assert.throws(
    () => authenticateContractRequest(headers(), { NODE_ENV: 'production' }),
    ContractAuthenticationError,
  );
  assert.throws(
    () => authenticateContractRequest(
      headers({
        authenticatedUserId: 'bad\nidentity',
        developmentUserId: 'valid-dev-user',
      }),
      { NODE_ENV: 'development' },
    ),
    ContractAuthenticationError,
  );
  assert.throws(
    () => authenticateContractRequest(
      headers({ authenticatedUserId: 'x'.repeat(257) }),
      { NODE_ENV: 'production' },
    ),
    ContractAuthenticationError,
  );
});
