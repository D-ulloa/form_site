import { describe, expect, it } from 'vitest';
import { contractIdentityHeaders } from '../../src/features/contracts/services/contractIdentity.ts';

describe('contractIdentityHeaders', () => {
  it('keeps hosted agent identity disabled by default', () => {
    expect(contractIdentityHeaders('agent-123', {
      development: false,
      allowInsecureAgentId: false,
    })).toBeUndefined();
  });

  it('sends the agent ID when hosted insecure identity is explicitly enabled', () => {
    expect(contractIdentityHeaders('agent-123', {
      development: false,
      allowInsecureAgentId: true,
    })).toEqual({ 'X-User-Id': 'agent-123' });
  });

  it('continues to send the agent ID during local development', () => {
    expect(contractIdentityHeaders('local-agent', {
      development: true,
      allowInsecureAgentId: false,
    })).toEqual({ 'X-User-Id': 'local-agent' });
  });

  it('does not send a missing agent ID in either mode', () => {
    expect(contractIdentityHeaders(undefined, {
      development: false,
      allowInsecureAgentId: true,
    })).toBeUndefined();
  });
});
