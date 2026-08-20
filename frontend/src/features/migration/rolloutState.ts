const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KEY = /^[a-z][a-z0-9_]{0,63}$/u;
const STATES = new Set(['disabled', 'certified_enabled']);

export interface RolloutContext {
  readonly organizationId: string;
  readonly contextEpoch: number;
  readonly certificationFingerprint: string;
}

export interface SafeFeatureSelection {
  readonly feature_key: string;
  readonly state: 'disabled' | 'certified_enabled';
}

const prefix = (context: RolloutContext) => {
  if (!UUID.test(context.organizationId) || !Number.isSafeInteger(context.contextEpoch)
    || context.contextEpoch < 0 || !/^[0-9a-f]{64}$/u.test(context.certificationFingerprint)) {
    throw new Error('INVALID_ROLLOUT_CONTEXT');
  }
  return ['solar-rollout', context.organizationId, context.contextEpoch, context.certificationFingerprint] as const;
};

export const rolloutQueryKeys = Object.freeze({
  manifest: (context: RolloutContext) => [...prefix(context), 'feature-manifest'] as const,
  feature: (context: RolloutContext, featureKey: string) => {
    if (!KEY.test(featureKey)) throw new Error('INVALID_FEATURE_KEY');
    return [...prefix(context), 'feature', featureKey] as const;
  },
});

export function parseSafeFeatureManifest(value: unknown, organizationId: string): readonly SafeFeatureSelection[] {
  if (!UUID.test(organizationId) || !Array.isArray(value)) throw new Error('INVALID_FEATURE_MANIFEST');
  const seen = new Set<string>();
  return Object.freeze(value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('INVALID_FEATURE_MANIFEST');
    const record = item as Record<string, unknown>;
    if (Object.keys(record).some((key) => !['feature_key', 'state'].includes(key))
      || typeof record.feature_key !== 'string' || !KEY.test(record.feature_key)
      || seen.has(record.feature_key) || typeof record.state !== 'string' || !STATES.has(record.state)) {
      throw new Error('INVALID_FEATURE_MANIFEST');
    }
    seen.add(record.feature_key);
    return Object.freeze({ feature_key: record.feature_key,
      state: record.state as SafeFeatureSelection['state'] });
  }));
}

export function isCurrentRolloutResponse(response: RolloutContext, current: RolloutContext): boolean {
  return response.organizationId === current.organizationId
    && response.contextEpoch === current.contextEpoch
    && response.certificationFingerprint === current.certificationFingerprint;
}

export function isFeatureAvailable(features: readonly SafeFeatureSelection[], featureKey: string): boolean {
  return features.some((feature) => feature.feature_key === featureKey && feature.state === 'certified_enabled');
}
