import { describe, expect, it } from 'vitest';
import { isCurrentTenantOperation, tenantDraftKey, tenantQueryKey } from '../../src/app/contexts/tenantState';

const AZAR = '20000000-0000-4000-8000-000000000001';
const SOLAR = '20000000-0000-4000-8000-000000000002';

describe('SPEC-27 tenant browser state', () => {
  it('starts every query key with immutable organization UUID and epoch', () => {
    expect(tenantQueryKey(AZAR, 3, 'contracts', { status: 'draft' })).toEqual([
      'organization', AZAR, 3, 'contracts', { status: 'draft' },
    ]);
    expect(() => tenantQueryKey('azar', 1, 'contracts')).toThrow();
  });

  it('rejects delayed callbacks after a tenant switch or epoch advance', () => {
    const captured = { organization_id: AZAR, epoch: 2 };
    expect(isCurrentTenantOperation(captured, { organization_id: SOLAR, epoch: 2 })).toBe(false);
    expect(isCurrentTenantOperation(captured, { organization_id: AZAR, epoch: 3 })).toBe(false);
    expect(isCurrentTenantOperation(captured, { organization_id: AZAR, epoch: 2 })).toBe(true);
  });

  it('partitions persisted drafts by user, organization, schema, purpose, and resource', () => {
    expect(tenantDraftKey({ schema_version: 1, user_id: 'user', organization_id: AZAR,
      purpose: 'property-draft', resource_id: 'draft-1' })).not.toEqual(
      tenantDraftKey({ schema_version: 1, user_id: 'user', organization_id: SOLAR,
        purpose: 'property-draft', resource_id: 'draft-1' }),
    );
  });
});
