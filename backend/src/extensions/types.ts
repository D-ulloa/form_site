export const EXTENSION_MODULE_KEYS = [
  'billing',
  'custom_domains',
  'enterprise_sso',
  'dedicated_isolation',
  'analytics',
] as const;

export type ExtensionModuleKey = typeof EXTENSION_MODULE_KEYS[number];
export type ExtensionModuleState = 'not_configured' | 'design_approved' | 'implemented'
  | 'certified' | 'enabled' | 'retired';

export interface ExtensionModuleStatus {
  readonly organization_id: string;
  readonly module_key: ExtensionModuleKey;
  readonly state: ExtensionModuleState;
  readonly version: number;
}

export interface ExtensionAccessInput {
  readonly requested_organization_id: string;
  readonly trusted_organization_id: string;
  readonly authorized: boolean;
  readonly organization_active: boolean;
  readonly status: ExtensionModuleStatus | null;
  readonly entitled?: boolean;
  readonly within_quota?: boolean;
}

export type ExtensionAccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'MODULE_NOT_AVAILABLE' | 'FEATURE_NOT_ENABLED' | 'QUOTA_EXCEEDED' };
