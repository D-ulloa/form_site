import { describe, expect, it } from 'vitest';
import {
  isCurrentPropertyResponse,
  isTerminalPropertyRun,
  preservePropertyVersionConflict,
  propertyQueryKeys,
  propertyRecoveryKey,
} from '../../src/features/properties/services/multiTenantPropertyState';

const azar = {
  organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', contextEpoch: 1,
};
const solar = { ...azar, organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };

describe('SPEC-30 tenant property state', () => {
  it('places immutable organization and epoch first in every cache key', () => {
    for (const key of [
      propertyQueryKeys.list(azar, { status: 'active' }),
      propertyQueryKeys.detail(azar, 'property'), propertyQueryKeys.history(azar, 'property'),
      propertyQueryKeys.run(azar, 'run'), propertyQueryKeys.draft(azar, 'draft'),
    ]) expect(key.slice(0, 3)).toEqual(['properties', azar.organizationId, 1]);
  });

  it('partitions recovery by organization, user, draft, and schema', () => {
    const draftId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const key = propertyRecoveryKey(azar, draftId, 'property-v1');
    expect(key).toContain(azar.organizationId);
    expect(key).toContain(azar.userId);
    expect(key).toContain(draftId);
    expect(propertyRecoveryKey(solar, draftId, 'property-v1')).not.toBe(key);
  });

  it('rejects delayed tenant, epoch, or user responses after context change', () => {
    expect(isCurrentPropertyResponse(azar, azar)).toBe(true);
    expect(isCurrentPropertyResponse(azar, solar)).toBe(false);
    expect(isCurrentPropertyResponse(azar, { ...azar, contextEpoch: 2 })).toBe(false);
    expect(isCurrentPropertyResponse(azar, {
      ...azar, userId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    })).toBe(false);
  });

  it('preserves unsaved payloads on conflict and classifies terminal run states', () => {
    const payload = { Calle: 'No perder' };
    expect(preservePropertyVersionConflict(payload, 2, 3)).toEqual({
      kind: 'version_conflict', expectedVersion: 2, latestVersion: 3, unsavedPayload: payload,
    });
    expect(isTerminalPropertyRun('processing')).toBe(false);
    for (const state of ['succeeded', 'partially_failed', 'failed', 'blocked', 'cancelled'] as const) {
      expect(isTerminalPropertyRun(state)).toBe(true);
    }
  });
});
