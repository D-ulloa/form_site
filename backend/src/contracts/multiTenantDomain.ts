import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PlatformError } from '../platform/errors.js';
import type { OrganizationScope } from '../platform/scope.js';

export type ContractActor =
  | { readonly actor_type: 'member'; readonly actor_user_id: string; readonly actor_membership_id: string }
  | { readonly actor_type: 'organization_api_key'; readonly api_key_id: string }
  | { readonly actor_type: 'external_contract_link'; readonly external_capability_id: string }
  | { readonly actor_type: 'platform_support'; readonly support_session_id: string; readonly support_reason: string }
  | { readonly actor_type: 'system_worker' | 'migration' };

export interface OrganizationRequestContext {
  readonly scope: OrganizationScope;
  readonly request_id: string;
  readonly context_epoch: number;
  readonly user_id: string;
  readonly membership_id: string;
  readonly role: 'owner' | 'admin' | 'member' | 'viewer';
  readonly record_visibility: 'organization' | 'assigned_only';
  readonly capabilities: ReadonlySet<string>;
}

export interface ContractLinkContext {
  readonly scope: OrganizationScope;
  readonly request_id: string;
  readonly link_id: string;
  readonly entry_id: string;
  readonly role: 'user' | 'client';
  readonly allowed_operations: ReadonlySet<'read' | 'submit' | 'upload' | 'view_asset'>;
  readonly expires_at: string;
}

export function requireContractCapability(
  context: OrganizationRequestContext,
  capability: string,
): void {
  if (!context.capabilities.has(capability)) throw new PlatformError('FORBIDDEN');
}

export function canSeeContract(
  context: OrganizationRequestContext,
  entry: { readonly organization_id: string; readonly assigned_to_user_id: string | null },
): boolean {
  if (entry.organization_id !== context.scope.organization_id) return false;
  if (context.record_visibility === 'organization' || context.role === 'owner' || context.role === 'admin') {
    return true;
  }
  return entry.assigned_to_user_id === context.user_id;
}

export function assertExpectedVersion(actual: number, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 1 || actual !== expected) {
    throw new PlatformError('VERSION_CONFLICT');
  }
}

const STATUS_TRANSITIONS = Object.freeze({
  open: new Set(['complete', 'archived']),
  complete: new Set(['generar_contrato', 'archived']),
  generar_contrato: new Set(['archived']),
  archived: new Set<string>(),
} satisfies Record<string, ReadonlySet<string>>);

export type ContractAggregateStatus = keyof typeof STATUS_TRANSITIONS;

export function assertContractStatusTransition(
  current: ContractAggregateStatus,
  next: ContractAggregateStatus,
): void {
  if (current === next) return;
  if (!STATUS_TRANSITIONS[current].has(next)) throw new PlatformError('VERSION_CONFLICT');
}

export interface GeneratedContractLinkToken {
  readonly raw_token: string;
  readonly token_hash: string;
  readonly token_prefix: string;
  readonly fingerprint: string;
}

function hashLinkToken(rawToken: string, pepper: string): Buffer {
  return createHash('sha256').update(pepper).update('\0').update(rawToken).digest();
}

export function createContractLinkToken(pepper: string): GeneratedContractLinkToken {
  if (Buffer.byteLength(pepper) < 32) throw new Error('CONTRACT_LINK_PEPPER_TOO_SHORT');
  const raw_token = randomBytes(32).toString('base64url');
  const digest = hashLinkToken(raw_token, pepper);
  return {
    raw_token,
    token_hash: digest.toString('hex'),
    token_prefix: raw_token.slice(0, 8),
    fingerprint: digest.toString('hex').slice(0, 16),
  };
}

export function contractLinkTokenMatches(rawToken: string, expectedHash: string, pepper: string): boolean {
  if (!/^[0-9a-f]{64}$/u.test(expectedHash)) return false;
  const actual = hashLinkToken(rawToken, pepper);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function assertActiveLink(
  link: { readonly status: string; readonly expires_at: string; readonly role: string; readonly allowed_operations: readonly string[] },
  role: 'user' | 'client',
  operation: string,
  now = new Date(),
): void {
  if (link.status !== 'active' || link.role !== role || !link.allowed_operations.includes(operation)) {
    throw new PlatformError('NOT_FOUND');
  }
  const expiry = Date.parse(link.expires_at);
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) throw new PlatformError('NOT_FOUND');
}

const BRAND_COLOR = /^#[0-9A-F]{6}$/u;
export const PLATFORM_CONTRACT_BRANDING = Object.freeze({
  display_name: 'Portal de contratos',
  primary_color: '#1F2937',
  accent_color: '#2563EB',
  logo_asset_id: null,
});

export interface PublicContractBranding {
  readonly display_name: string;
  readonly primary_color: string;
  readonly accent_color: string;
  readonly logo_asset_id: string | null;
}

export function projectPublicContractBranding(settings: {
  readonly public_display_name?: string | null;
  readonly primary_color?: string | null;
  readonly accent_color?: string | null;
  readonly logo_asset_id?: string | null;
} | null): PublicContractBranding {
  if (!settings) return PLATFORM_CONTRACT_BRANDING;
  const displayName = settings.public_display_name?.trim();
  return Object.freeze({
    display_name: displayName && displayName.length <= 160
      ? displayName.replace(/[\u0000-\u001F\u007F<>]/gu, '')
      : PLATFORM_CONTRACT_BRANDING.display_name,
    primary_color: settings.primary_color && BRAND_COLOR.test(settings.primary_color)
      ? settings.primary_color : PLATFORM_CONTRACT_BRANDING.primary_color,
    accent_color: settings.accent_color && BRAND_COLOR.test(settings.accent_color)
      ? settings.accent_color : PLATFORM_CONTRACT_BRANDING.accent_color,
    logo_asset_id: settings.logo_asset_id && /^[0-9a-f-]{36}$/iu.test(settings.logo_asset_id)
      ? settings.logo_asset_id : null,
  });
}

const ALLOWED_TEMPLATE_KEYS = new Set(['schema_id', 'contract_type', 'roles', 'sections', 'computed_fields', 'generation']);
const FORBIDDEN_TEMPLATE_KEY = /(?:html|css|javascript|script|sql|expression|webhook|secret)/iu;

export function validateContractTemplateDefinition(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_TEMPLATE');
  const definition = value as Record<string, unknown>;
  if (Buffer.byteLength(JSON.stringify(definition)) > 256 * 1024) throw new Error('TEMPLATE_TOO_LARGE');
  for (const key of Object.keys(definition)) {
    if (!ALLOWED_TEMPLATE_KEYS.has(key) || FORBIDDEN_TEMPLATE_KEY.test(key)) throw new Error('UNSAFE_TEMPLATE');
  }
  if (typeof definition.schema_id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/u.test(definition.schema_id)) {
    throw new Error('INVALID_TEMPLATE_SCHEMA_ID');
  }
  if (!definition.roles || typeof definition.roles !== 'object' || Array.isArray(definition.roles)) {
    throw new Error('INVALID_TEMPLATE_ROLES');
  }
  const roles = definition.roles as Record<string, unknown>;
  if (!roles.user || !roles.client || Object.keys(roles).some((role) => role !== 'user' && role !== 'client')) {
    throw new Error('INVALID_TEMPLATE_ROLES');
  }
  return Object.freeze(structuredClone(definition));
}
