import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  normalizeOrganizationEmail, validateDisplayName, validateLocale, validateOrganizationSlug, validateTimeZone,
} from '../organizations/validation.js';
import { OrganizationProvisioningError, type OrganizationProvisioningManifest } from './organizationProvisioningTypes.js';

export const ORGANIZATION_PROVISIONING_MANIFEST_MAX_BYTES = 32_768;
// Leaves room for the SPEC-35 ":owner" suffix inside its 160-byte idempotency limit.
const OPERATION_ID = /^orgprov_[A-Za-z0-9][A-Za-z0-9._:-]{7,145}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const APPROVAL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/u;
const SECRET_KEY = /(password|secret|token|api.?key|private.?key|credential|session)/iu;

const manifestSchema = z.strictObject({
  schema_version: z.literal(1),
  operation_id: z.string(),
  requested_at: z.string(),
  requested_by_operator_user_id: z.string(),
  approval_reference: z.string(),
  operator_owner_identity_equality_approved: z.literal(true).optional(),
  organization: z.strictObject({
    slug: z.string(), display_name: z.string(), legal_name: z.string(),
    plan_key: z.enum(['internal', 'standard', 'enterprise']), locale: z.string(), time_zone: z.string(),
  }),
  initial_owner: z.strictObject({
    email: z.string(), display_name: z.string(), locale: z.string(), time_zone: z.string(),
  }),
});

function assertNoSecretKeys(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(assertNoSecretKeys); return; }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new OrganizationProvisioningError('SECRET_MATERIAL_FORBIDDEN');
    assertNoSecretKeys(child);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonicalize(child)]));
  return value;
}

export function manifestFingerprint(manifest: OrganizationProvisioningManifest): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(manifest))).digest('hex');
}

export function parseOrganizationProvisioningManifest(contents: string): OrganizationProvisioningManifest {
  if (Buffer.byteLength(contents, 'utf8') > ORGANIZATION_PROVISIONING_MANIFEST_MAX_BYTES) {
    throw new OrganizationProvisioningError('MANIFEST_TOO_LARGE');
  }
  let raw: unknown;
  try { raw = JSON.parse(contents); } catch { throw new OrganizationProvisioningError('INVALID_MANIFEST'); }
  assertNoSecretKeys(raw);
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) throw new OrganizationProvisioningError('INVALID_MANIFEST');
  const value = parsed.data;
  const requestedAt = new Date(value.requested_at);
  if (!OPERATION_ID.test(value.operation_id) || !UUID.test(value.requested_by_operator_user_id)
    || !APPROVAL.test(value.approval_reference) || Number.isNaN(requestedAt.getTime())
    || requestedAt.toISOString() !== value.requested_at) {
    throw new OrganizationProvisioningError('INVALID_MANIFEST');
  }
  try {
    return Object.freeze({
      ...value,
      approval_reference: value.approval_reference.trim(),
      organization: Object.freeze({ ...value.organization,
        slug: validateOrganizationSlug(value.organization.slug),
        display_name: validateDisplayName(value.organization.display_name),
        legal_name: validateDisplayName(value.organization.legal_name, 240),
        locale: validateLocale(value.organization.locale), time_zone: validateTimeZone(value.organization.time_zone) }),
      initial_owner: Object.freeze({ ...value.initial_owner,
        email: normalizeOrganizationEmail(value.initial_owner.email),
        display_name: validateDisplayName(value.initial_owner.display_name),
        locale: validateLocale(value.initial_owner.locale), time_zone: validateTimeZone(value.initial_owner.time_zone) }),
    });
  } catch {
    throw new OrganizationProvisioningError('INVALID_MANIFEST');
  }
}

export function maskProvisioningEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}
