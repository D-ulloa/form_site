import { describe, expect, it } from 'vitest';
import { isCurrentRolloutResponse, isFeatureAvailable, parseSafeFeatureManifest, rolloutQueryKeys }
  from '../../src/features/migration/rolloutState';

const azar = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('SPEC-34 browser rollout boundary', () => {
  it('partitions state by organization, epoch, and immutable certification', () => {
    const fingerprint = 'a'.repeat(64);
    const context = { organizationId: azar, contextEpoch: 7, certificationFingerprint: fingerprint };
    expect(rolloutQueryKeys.manifest(context)).toEqual(['solar-rollout', azar, 7, fingerprint, 'feature-manifest']);
    expect(isCurrentRolloutResponse(context, { ...context, contextEpoch: 8 })).toBe(false);
    expect(isCurrentRolloutResponse(context, { ...context, certificationFingerprint: 'b'.repeat(64) })).toBe(false);
    expect(() => rolloutQueryKeys.manifest({ ...context, certificationFingerprint: 'mutable-label' }))
      .toThrow('INVALID_ROLLOUT_CONTEXT');
  });

  it('accepts only a closed safe response and enables only certified_enabled', () => {
    const features = parseSafeFeatureManifest([
      { feature_key: 'contracts', state: 'certified_enabled' },
      { feature_key: 'billing', state: 'disabled' },
    ], azar);
    expect(isFeatureAvailable(features, 'contracts')).toBe(true);
    expect(isFeatureAvailable(features, 'billing')).toBe(false);
    expect(isFeatureAvailable(features, 'unknown')).toBe(false);
    expect(() => parseSafeFeatureManifest([
      { feature_key: 'contracts', state: 'certified_enabled', provider_destination: 'azar-drive' },
    ], azar)).toThrow('INVALID_FEATURE_MANIFEST');
    expect(() => parseSafeFeatureManifest([
      { feature_key: 'contracts', state: 'certified_enabled' },
      { feature_key: 'contracts', state: 'disabled' },
    ], azar)).toThrow('INVALID_FEATURE_MANIFEST');
  });
});
