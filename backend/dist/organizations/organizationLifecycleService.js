import { OrganizationDomainError } from './errors.js';
import { hasOrganizationCapability } from './roleCapabilities.js';
export const SPEC26_RETENTION_POLICY_VERSION = 'spec25-2026-08-18';
export const REQUIRED_DELETION_RECEIPTS = [
    'database', 'storage', 'providers', 'integration_secrets', 'jobs',
    'exports', 'logs_audit', 'backups', 'billing',
];
export function assertDeletionCanFinalize(input) {
    if (input.active_legal_hold)
        throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Deletion is blocked by legal hold.');
    const complete = new Set(input.completed_receipts);
    if (REQUIRED_DELETION_RECEIPTS.some((receipt) => !complete.has(receipt))) {
        throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Deletion cleanup receipts are incomplete.');
    }
}
export class OrganizationLifecycleService {
    requestExport(actor) {
        if (!hasOrganizationCapability(actor.membership.role, actor.membership.status, actor.organization.status, 'organization.export'))
            throw new OrganizationDomainError('FORBIDDEN');
        throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Export serializers and private asset delivery land in SPEC-28 through SPEC-32.');
    }
    requestDeletion(actor) {
        if (!hasOrganizationCapability(actor.membership.role, actor.membership.status, actor.organization.status, 'organization.request_deletion'))
            throw new OrganizationDomainError('FORBIDDEN');
        throw new OrganizationDomainError('DEPENDENCY_NOT_READY', 'Deletion remains disabled until a numeric grace period and downstream cleanup workers are approved.');
    }
}
//# sourceMappingURL=organizationLifecycleService.js.map