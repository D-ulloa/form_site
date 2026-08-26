import { createHmac, randomUUID } from 'node:crypto';
import type { IdentityProvisioningService } from '../identity/identityProvisioningService.js';
import { IdentityProvisioningError, createPlatformProvisioningActor } from '../identity/identityProvisioningTypes.js';
import type { IdentityAdminAdapter } from '../identity/supabaseAdminAdapter.js';
import { OrganizationDomainError } from '../organizations/errors.js';
import type { OrganizationService } from '../organizations/organizationService.js';
import { assertOrganizationProvisioningEnabled, resolveOrganizationProvisioningTarget } from './organizationProvisioningConfig.js';
import { manifestFingerprint, maskProvisioningEmail } from './organizationProvisioningManifest.js';
import type { OrganizationProvisioningRepository } from './organizationProvisioningRepository.js';
import { OrganizationProvisioningError, type OrganizationProvisioningManifest,
  type OrganizationProvisioningOperation, type OrganizationProvisioningReceipt } from './organizationProvisioningTypes.js';

export interface OrganizationProvisioningPlan {
  readonly mode: 'dry_run';
  readonly operation_id: string;
  readonly manifest_fingerprint: string;
  readonly organization_slug: string;
  readonly owner_email_masked: string;
  readonly owner_action: 'create_activation_required' | 'reuse_active' | 'reuse_activation_required';
  readonly planned_actions: readonly string[];
  readonly blockers: readonly string[];
}

function receipt(operation: OrganizationProvisioningOperation, email: string,
  result: OrganizationProvisioningReceipt['result']): OrganizationProvisioningReceipt {
  if (operation.state !== 'completed' || !operation.owner_user_id) {
    throw new OrganizationProvisioningError('READBACK_FAILED');
  }
  return { operation_id: operation.operation_id, manifest_fingerprint: operation.manifest_fingerprint,
    organization_id: operation.organization_id, organization_slug: operation.organization_slug,
    owner_user_id: operation.owner_user_id, owner_membership_id: operation.owner_membership_id, result,
    activation_state: operation.activation_required ? 'required' : 'active', handoff_state: operation.handoff_state,
    request_id: operation.request_id, evidence_timestamp: operation.evidence_timestamp,
    owner_email_masked: maskProvisioningEmail(email) };
}

export class OrganizationProvisioningService {
  constructor(private readonly repository: OrganizationProvisioningRepository,
    private readonly identity: IdentityProvisioningService, private readonly identityAdmin: IdentityAdminAdapter,
    private readonly organizations: OrganizationService, private readonly environment: NodeJS.ProcessEnv = process.env) {}

  private async preflight(manifest: OrganizationProvisioningManifest) {
    const target = resolveOrganizationProvisioningTarget(this.environment);
    if (target.approval_reference !== manifest.approval_reference) {
      throw new OrganizationProvisioningError('APPROVAL_REQUIRED');
    }
    const database = await this.repository.preflight({ manifest, step_up_session_id: target.step_up_session_id });
    if (!database.operator_eligible) throw new OrganizationProvisioningError('FORBIDDEN');
    let owners;
    try { owners = await this.identityAdmin.resolveByEmail(manifest.initial_owner.email); }
    catch { throw new OrganizationProvisioningError('OWNER_PROVISIONING_FAILED'); }
    const blockers: string[] = [];
    if (!database.slug_available) blockers.push('SLUG_CONFLICT');
    if (database.migration_conflict) blockers.push('MIGRATION_INVENTORY_CONFLICT');
    if (owners.length > 1) blockers.push('OWNER_IDENTITY_AMBIGUOUS');
    if (owners.length === 1 && !owners[0]?.eligible) blockers.push('OWNER_IDENTITY_INELIGIBLE');
    if (owners[0]?.id === manifest.requested_by_operator_user_id
      && manifest.operator_owner_identity_equality_approved !== true) blockers.push('APPROVAL_REQUIRED');
    const ownerAction = owners.length === 0 ? 'create_activation_required' as const
      : owners[0]?.activation_required ? 'reuse_activation_required' as const : 'reuse_active' as const;
    return { target, blockers, ownerAction };
  }

  async dryRun(manifest: OrganizationProvisioningManifest): Promise<OrganizationProvisioningPlan> {
    const fingerprint = manifestFingerprint(manifest);
    const checked = await this.preflight(manifest);
    return { mode: 'dry_run', operation_id: manifest.operation_id, manifest_fingerprint: fingerprint,
      organization_slug: manifest.organization.slug, owner_email_masked: maskProvisioningEmail(manifest.initial_owner.email),
      owner_action: checked.ownerAction,
      planned_actions: Object.freeze(['provision_or_reconcile_initial_owner', 'create_organization_atomically',
        'verify_receipt', 'queue_owner_handoff']), blockers: Object.freeze(checked.blockers) };
  }

  async execute(manifest: OrganizationProvisioningManifest, expectedFingerprint: string): Promise<OrganizationProvisioningReceipt> {
    assertOrganizationProvisioningEnabled(this.environment);
    const fingerprint = manifestFingerprint(manifest);
    if (!/^[0-9a-f]{64}$/u.test(expectedFingerprint)) throw new OrganizationProvisioningError('FINGERPRINT_REQUIRED');
    if (fingerprint !== expectedFingerprint) throw new OrganizationProvisioningError('FINGERPRINT_MISMATCH');
    const target = resolveOrganizationProvisioningTarget(this.environment);
    if (target.approval_reference !== manifest.approval_reference) {
      throw new OrganizationProvisioningError('APPROVAL_REQUIRED');
    }
    const database = await this.repository.preflight({ manifest, step_up_session_id: target.step_up_session_id });
    if (!database.operator_eligible) throw new OrganizationProvisioningError('FORBIDDEN');
    if (database.migration_conflict) throw new OrganizationProvisioningError('MIGRATION_INVENTORY_CONFLICT');
    const pepper = this.environment.IDENTITY_PROVISIONING_EMAIL_PEPPER?.trim();
    if (!pepper || Buffer.byteLength(pepper, 'utf8') < 32) throw new OrganizationProvisioningError('PROVISIONING_DISABLED');
    const requestId = `orgprov:${randomUUID()}`;
    const operation = await this.repository.claim({ manifest, manifest_fingerprint: fingerprint,
      owner_email_fingerprint: createHmac('sha256', pepper).update(manifest.initial_owner.email).digest('hex'),
      step_up_session_id: target.step_up_session_id, deployment_identity: target.deployment_identity,
      target_project_ref: target.project_ref, request_id: requestId });
    if (operation.claim_state === 'replayed' || operation.state === 'completed') {
      return receipt(operation, manifest.initial_owner.email, 'already_applied');
    }
    if (operation.state === 'attention_required') throw new OrganizationProvisioningError('READBACK_FAILED');
    let ownerMatches;
    try { ownerMatches = await this.identityAdmin.resolveByEmail(manifest.initial_owner.email); }
    catch { throw new OrganizationProvisioningError('OWNER_PROVISIONING_FAILED'); }
    if (ownerMatches.length > 1) throw new OrganizationProvisioningError('OWNER_IDENTITY_AMBIGUOUS');
    if (ownerMatches.length === 1 && !ownerMatches[0]?.eligible) {
      throw new OrganizationProvisioningError('OWNER_IDENTITY_INELIGIBLE');
    }
    if (ownerMatches[0]?.id === manifest.requested_by_operator_user_id
      && manifest.operator_owner_identity_equality_approved !== true) {
      throw new OrganizationProvisioningError('APPROVAL_REQUIRED');
    }
    const actor = createPlatformProvisioningActor({ actor_type: 'platform_operator',
      user_id: manifest.requested_by_operator_user_id, assurance_level: 'aal2',
      step_up_reference: target.step_up_session_id });
    let owner;
    try {
      owner = await this.identity.provision({ email: manifest.initial_owner.email,
        display_name: manifest.initial_owner.display_name, locale: manifest.initial_owner.locale,
        time_zone: manifest.initial_owner.time_zone, purpose: 'initial_owner', request_id: requestId,
        idempotency_key: `${manifest.operation_id}:owner` }, actor);
    } catch (error) {
      if (error instanceof IdentityProvisioningError && error.code === 'PROVISIONING_IN_PROGRESS') {
        throw new OrganizationProvisioningError('PROVISIONING_IN_PROGRESS');
      }
      throw new OrganizationProvisioningError('OWNER_PROVISIONING_FAILED');
    }
    if (!owner.user_id || owner.outcome === 'blocked_ambiguous' || owner.outcome === 'blocked_ineligible') {
      throw new OrganizationProvisioningError(owner.outcome === 'blocked_ambiguous'
        ? 'OWNER_IDENTITY_AMBIGUOUS' : 'OWNER_IDENTITY_INELIGIBLE');
    }
    try {
      await this.organizations.createOrganization({ organization_id: operation.organization_id,
        initial_owner_membership_id: operation.owner_membership_id, ...manifest.organization,
        creation_source: 'platform', initial_owner_user_id: owner.user_id }, {
        actor_type: 'platform_operator', user_id: manifest.requested_by_operator_user_id, request_id: requestId,
      });
    } catch (error) {
      try {
        const reconciled = await this.repository.complete({ operation_id: manifest.operation_id,
          manifest_fingerprint: fingerprint, owner_user_id: owner.user_id,
          activation_required: owner.activation_required, request_id: requestId });
        return receipt(reconciled, manifest.initial_owner.email, 'already_applied');
      } catch (reconciliationError) {
        if (reconciliationError instanceof OrganizationProvisioningError
          && reconciliationError.code !== 'READBACK_FAILED') throw reconciliationError;
        if (error instanceof OrganizationDomainError && error.code === 'VERSION_CONFLICT') {
          throw new OrganizationProvisioningError('SLUG_CONFLICT');
        }
        throw new OrganizationProvisioningError('READBACK_FAILED');
      }
    }
    const completed = await this.repository.complete({ operation_id: manifest.operation_id,
      manifest_fingerprint: fingerprint, owner_user_id: owner.user_id,
      activation_required: owner.activation_required, request_id: requestId });
    return receipt(completed, manifest.initial_owner.email, 'created');
  }

  async status(operationId: string): Promise<OrganizationProvisioningOperation> {
    resolveOrganizationProvisioningTarget(this.environment);
    return this.repository.get(operationId);
  }
}
