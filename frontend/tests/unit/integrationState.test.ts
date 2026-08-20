import { describe, expect, it } from 'vitest';
import { clearWriteOnlySecret, integrationQueryKeys, isCurrentIntegrationResponse, parseSafeIntegration } from '../../src/features/integrations/integrationState';

const azar = { organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contextEpoch: 1 };
const solar = { organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', contextEpoch: 1 };

describe('SPEC-32 safe tenant integration state', () => {
  it('places organization and context epoch first in every cache key', () => {
    for (const key of [integrationQueryKeys.list(azar), integrationQueryKeys.detail(azar, 'integration'),
      integrationQueryKeys.deliveries(azar), integrationQueryKeys.delivery(azar, 'delivery')]) {
      expect(key.slice(0, 3)).toEqual(['integrations', azar.organizationId, 1]);
    }
  });
  it('rejects delayed responses after organization switch', () => {
    expect(isCurrentIntegrationResponse(azar, azar)).toBe(true);
    expect(isCurrentIntegrationResponse(azar, solar)).toBe(false);
    expect(isCurrentIntegrationResponse(azar, { ...azar, contextEpoch: 2 })).toBe(false);
  });
  it('accepts masked projections and rejects secret-bearing responses', () => {
    const safe = { id: 'integration', provider: 'google_drive', purpose: 'property_export', state: 'active',
      masked_destination: 'Azar / …123', health_state: 'healthy', version: 1 };
    expect(parseSafeIntegration(safe)).toEqual(safe);
    expect(() => parseSafeIntegration({ ...safe, credential_ref: 'vault://x' })).toThrow('UNSAFE');
    expect(() => parseSafeIntegration({ ...safe, endpoint_url: 'https://secret.example' })).toThrow('UNSAFE');
  });
  it('clears write-only secret form material after mutation', () => {
    const form = { secret: 'temporary' }; clearWriteOnlySecret(form); expect(form.secret).toBe('');
  });
});
