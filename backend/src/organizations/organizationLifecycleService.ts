import { OrganizationDomainError } from './errors.js';
import { hasOrganizationCapability } from './roleCapabilities.js';
import type { OrganizationActorContext } from './types.js';

export const SPEC26_RETENTION_POLICY_VERSION = 'spec25-2026-08-18';
export const REQUIRED_DELETION_RECEIPTS = [
  'database', 'storage', 'providers', 'integration_secrets', 'jobs',
  'exports', 'logs_audit', 'backups', 'billing',
] as const;

export type DeletionReceiptDomain = typeof REQUIRED_DELETION_RECEIPTS[number];

export function assertDeletionCanFinalize(input: {
  readonly active_legal_hold: boolean;
  readonly completed_receipts: readonly DeletionReceiptDomain[];
}): void {
  if (input.active_legal_hold) throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Deletion is blocked by legal hold.');
  const complete = new Set(input.completed_receipts);
  if (REQUIRED_DELETION_RECEIPTS.some((receipt) => !complete.has(receipt))) {
    throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Deletion cleanup receipts are incomplete.');
  }
}

export class OrganizationLifecycleService {
  requestExport(actor: OrganizationActorContext): never {
    if (!hasOrganizationCapability(
      actor.membership.role, actor.membership.status, actor.organization.status, 'organization.export',
    )) throw new OrganizationDomainError('FORBIDDEN');
    throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Export serializers and private asset delivery land in SPEC-28 through SPEC-32.');
  }

  requestDeletion(actor: OrganizationActorContext): never {
    if (!hasOrganizationCapability(
      actor.membership.role, actor.membership.status, actor.organization.status, 'organization.request_deletion',
    )) throw new OrganizationDomainError('FORBIDDEN');
    throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Deletion remains disabled until a numeric grace period and downstream cleanup workers are approved.');
  }
}

