import { describe, expect, it } from 'vitest';
import { extensionQueryKeys, isCurrentExtensionResponse, isExtensionRouteAvailable, parseSafeExtensionModule }
  from '../../src/features/extensions/extensionState';

const azar = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const solar = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('SPEC-33 extension module browser boundary', () => {
  it('partitions all query keys by immutable organization and context epoch', () => {
    const state = { organizationId: azar, contextEpoch: 4 };
    expect(extensionQueryKeys.modules(state)).toEqual(['extension-modules', azar, 4, 'modules']);
    expect(extensionQueryKeys.module(state, 'analytics')).toEqual(['extension-modules', azar, 4, 'module', 'analytics']);
    expect(() => extensionQueryKeys.module(state, 'unknown')).toThrow('UNKNOWN_EXTENSION_MODULE');
  });

  it('rejects stale responses, unsafe fields, and direct navigation unless server-enabled', () => {
    expect(isCurrentExtensionResponse({ organizationId: azar, contextEpoch: 2 },
      { organizationId: solar, contextEpoch: 2 })).toBe(false);
    expect(() => parseSafeExtensionModule({ organization_id: azar, module_key: 'billing', state: 'enabled',
      version: 1, provider_customer_id: 'cus_secret' })).toThrow('UNSAFE_EXTENSION_RESPONSE');
    const certified = parseSafeExtensionModule({ organization_id: azar, module_key: 'billing', state: 'certified', version: 3 });
    const enabled = parseSafeExtensionModule({ ...certified, state: 'enabled', version: 4 });
    expect(isExtensionRouteAvailable(certified, azar)).toBe(false);
    expect(isExtensionRouteAvailable(enabled, solar)).toBe(false);
    expect(isExtensionRouteAvailable(enabled, azar)).toBe(true);
  });
});
