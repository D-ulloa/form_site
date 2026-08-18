import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContractAuthenticationError,
  ContractAuthorizationError,
  authenticateContractRequest,
  authorizeContractAdmin,
  authorizeContractEntryAccess,
  authorizeContractUserScope,
  canAccessContractEntry,
  type ContractAuthenticationInput,
} from '../../src/services/contractAuth.js';

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
    { NODE_ENV: 'production', CONTRACT_TRUSTED_GATEWAY_ENABLED: 'true' },
  );
  assert.deepEqual(principal, { mode: 'gateway', userId: 'gateway-user' });
  assert.doesNotThrow(() => authorizeContractUserScope(principal, 'gateway-user'));
  assert.throws(
    () => authorizeContractUserScope(principal, 'different-user'),
    ContractAuthorizationError,
  );
});

test('Supabase password sessions are user-scoped and carry the administrator grant', () => {
  const principal = authenticateContractRequest(
    headers({
      passwordSession: {
        userId: 'supabase-user',
        email: 'ADMIN@EXAMPLE.TEST',
        isAdmin: true,
      },
    }),
    { NODE_ENV: 'production' },
  );
  assert.deepEqual(principal, {
    mode: 'supabase',
    userId: 'supabase-user',
    email: 'admin@example.test',
    isAdmin: true,
  });
  assert.doesNotThrow(() => authorizeContractUserScope(principal, 'supabase-user'));
  assert.doesNotThrow(() => authorizeContractAdmin(principal));

  const nonAdmin = authenticateContractRequest(
    headers({
      passwordSession: {
        userId: 'regular-user',
        email: 'user@example.test',
        isAdmin: false,
      },
    }),
  );
  assert.throws(() => authorizeContractAdmin(nonAdmin), ContractAuthorizationError);
});

test('SPEC-22 scopes new contract entries by database user while preserving legacy access', () => {
  const owner = authenticateContractRequest(
    headers({
      passwordSession: {
        userId: 'supabase-owner',
        email: 'owner@example.test',
        isAdmin: true,
      },
    }),
    { NODE_ENV: 'production' },
  );
  const otherUser = authenticateContractRequest(
    headers({
      passwordSession: {
        userId: 'supabase-other',
        email: 'other@example.test',
        isAdmin: true,
      },
    }),
    { NODE_ENV: 'production' },
  );
  const ownedEntry = { createdByUserId: 'supabase-owner' };
  const foreignEntry = { createdByUserId: 'supabase-other' };
  const legacyEntry = { createdByUserId: null };
  const malformedEntry = { createdByUserId: '   ' };

  assert.equal(canAccessContractEntry(owner, ownedEntry), true);
  assert.equal(canAccessContractEntry(otherUser, ownedEntry), false);
  assert.equal(canAccessContractEntry(owner, legacyEntry), true);
  assert.equal(canAccessContractEntry(owner, malformedEntry), false);
  assert.doesNotThrow(() => authorizeContractEntryAccess(owner, legacyEntry));
  assert.throws(
    () => authorizeContractEntryAccess(owner, foreignEntry),
    ContractAuthorizationError,
  );

  const apiKey = authenticateContractRequest(
    headers({ authorization: 'Bearer test-contract-key' }),
    { CONTRACTS_API_KEY: 'test-contract-key', NODE_ENV: 'production' },
  );
  assert.equal(canAccessContractEntry(apiKey, foreignEntry), true);
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

test('hosted agent identity cannot be re-enabled by the deprecated flag', () => {
  for (const value of ['true', 'false', 'TRUE', '1', ' true ', '']) {
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

test('trusted gateway identity fails closed without the reviewed adapter flag', () => {
  assert.throws(
    () => authenticateContractRequest(
      headers({ authenticatedUserId: 'gateway-user' }),
      { NODE_ENV: 'production' },
    ),
    ContractAuthenticationError,
  );
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
