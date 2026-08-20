import { EXTENSION_MODULE_KEYS, type ExtensionAccessDecision, type ExtensionAccessInput,
  type ExtensionModuleKey, type ExtensionModuleState } from './types.js';

const modules = new Set<string>(EXTENSION_MODULE_KEYS);

const transitions: Readonly<Record<ExtensionModuleState, ReadonlySet<ExtensionModuleState>>> = {
  not_configured: new Set(['design_approved', 'retired']),
  design_approved: new Set(['implemented', 'not_configured', 'retired']),
  implemented: new Set(['certified', 'design_approved', 'retired']),
  certified: new Set(['enabled', 'implemented', 'retired']),
  enabled: new Set(['certified', 'retired']),
  retired: new Set(),
};

export function isExtensionModuleKey(value: string): value is ExtensionModuleKey {
  return modules.has(value);
}

export function assertExtensionModuleTransition(
  from: ExtensionModuleState,
  to: ExtensionModuleState,
): void {
  if (from === to || !transitions[from].has(to)) throw new Error('INVALID_MODULE_TRANSITION');
}

/**
 * Core authorization is deliberately evaluated before optional commercial state.
 * A module or entitlement may only narrow a previously authorized request.
 */
export function evaluateExtensionAccess(input: ExtensionAccessInput): ExtensionAccessDecision {
  if (input.requested_organization_id !== input.trusted_organization_id) {
    return { allowed: false, code: 'NOT_FOUND' };
  }
  if (!input.authorized || !input.organization_active) {
    return { allowed: false, code: 'FORBIDDEN' };
  }
  if (!input.status || input.status.organization_id !== input.trusted_organization_id
    || input.status.state !== 'enabled') {
    return { allowed: false, code: 'MODULE_NOT_AVAILABLE' };
  }
  if (input.entitled !== true) return { allowed: false, code: 'FEATURE_NOT_ENABLED' };
  if (input.within_quota === false) return { allowed: false, code: 'QUOTA_EXCEEDED' };
  return { allowed: true };
}
