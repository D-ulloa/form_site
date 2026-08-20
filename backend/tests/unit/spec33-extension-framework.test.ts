import assert from 'node:assert/strict';
import test from 'node:test';
import { assertExtensionModuleTransition, evaluateExtensionAccess, isExtensionModuleKey }
  from '../../src/extensions/moduleGate.js';
import type { ExtensionModuleStatus } from '../../src/extensions/types.js';

const azar = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const solar = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const enabled: ExtensionModuleStatus = {
  organization_id: azar, module_key: 'billing', state: 'enabled', version: 5,
};

test('SPEC-33 registry is closed and state transitions require certification before enablement', () => {
  assert.equal(isExtensionModuleKey('enterprise_sso'), true);
  assert.equal(isExtensionModuleKey('price_override'), false);
  assert.doesNotThrow(() => assertExtensionModuleTransition('implemented', 'certified'));
  assert.doesNotThrow(() => assertExtensionModuleTransition('certified', 'enabled'));
  assert.throws(() => assertExtensionModuleTransition('implemented', 'enabled'), /INVALID_MODULE_TRANSITION/u);
  assert.throws(() => assertExtensionModuleTransition('retired', 'enabled'), /INVALID_MODULE_TRANSITION/u);
});

test('SPEC-33 module state and entitlement can restrict but never grant core authorization', () => {
  assert.deepEqual(evaluateExtensionAccess({ requested_organization_id: azar, trusted_organization_id: azar,
    authorized: false, organization_active: true, status: enabled, entitled: true }),
  { allowed: false, code: 'FORBIDDEN' });
  assert.deepEqual(evaluateExtensionAccess({ requested_organization_id: azar, trusted_organization_id: azar,
    authorized: true, organization_active: true, status: { ...enabled, state: 'certified' } }),
  { allowed: false, code: 'MODULE_NOT_AVAILABLE' });
  assert.deepEqual(evaluateExtensionAccess({ requested_organization_id: azar, trusted_organization_id: azar,
    authorized: true, organization_active: true, status: enabled, entitled: false }),
  { allowed: false, code: 'FEATURE_NOT_ENABLED' });
  assert.deepEqual(evaluateExtensionAccess({ requested_organization_id: azar, trusted_organization_id: azar,
    authorized: true, organization_active: true, status: enabled, entitled: true, within_quota: false }),
  { allowed: false, code: 'QUOTA_EXCEEDED' });
  assert.deepEqual(evaluateExtensionAccess({ requested_organization_id: azar, trusted_organization_id: azar,
    authorized: true, organization_active: true, status: enabled, entitled: true, within_quota: true }),
  { allowed: true });
});

test('SPEC-33 cross-organization status and identifiers fail generically', () => {
  assert.deepEqual(evaluateExtensionAccess({ requested_organization_id: solar, trusted_organization_id: azar,
    authorized: true, organization_active: true, status: enabled, entitled: true }),
  { allowed: false, code: 'NOT_FOUND' });
  assert.deepEqual(evaluateExtensionAccess({ requested_organization_id: azar, trusted_organization_id: azar,
    authorized: true, organization_active: true, status: { ...enabled, organization_id: solar } }),
  { allowed: false, code: 'MODULE_NOT_AVAILABLE' });
});
