import { describe, expect, it } from 'vitest';
import { contractIdentityHeaders } from '../../src/features/contracts/services/contractIdentity.ts';

describe('contractIdentityHeaders', () => {
  it('keeps hosted agent identity disabled by default', () => {
    expect(contractIdentityHeaders('agent-123', {
      development: false,
    })).toBeUndefined();
  });

  it('cannot opt hosted deployments back into browser-controlled identity', () => {
    expect(contractIdentityHeaders('agent-123', {
      development: false,
    })).toBeUndefined();
  });

  it('continues to send the agent ID during local development', () => {
    expect(contractIdentityHeaders('local-agent', {
      development: true,
    })).toEqual({ 'X-User-Id': 'local-agent' });
  });

  it('does not send a missing agent ID in either mode', () => {
    expect(contractIdentityHeaders(undefined, {
      development: false,
    })).toBeUndefined();
  });
});
