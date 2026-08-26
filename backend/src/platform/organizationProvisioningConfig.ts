import { OrganizationProvisioningError } from './organizationProvisioningTypes.js';

const PROJECT_REF = /^[a-z0-9]{8,40}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface OrganizationProvisioningTarget {
  readonly environment: 'production';
  readonly project_ref: string;
  readonly deployment_identity: string;
  readonly step_up_session_id: string;
  readonly approval_reference: string;
}

export function resolveOrganizationProvisioningTarget(environment: NodeJS.ProcessEnv): OrganizationProvisioningTarget {
  const targetEnvironment = environment.PLATFORM_PROVISIONING_ENVIRONMENT?.trim();
  const expectedProject = environment.PLATFORM_PROVISIONING_PROJECT_REF?.trim();
  const deploymentIdentity = environment.PLATFORM_PROVISIONING_DEPLOYMENT_IDENTITY?.trim();
  const stepUp = environment.PLATFORM_PROVISIONING_STEP_UP_SESSION_ID?.trim();
  const approvalReference = environment.PLATFORM_PROVISIONING_APPROVAL_REFERENCE?.trim();
  let actualProject = '';
  try { actualProject = new URL(environment.SUPABASE_URL ?? '').hostname.split('.')[0] ?? ''; } catch { /* fail below */ }
  if (targetEnvironment !== 'production' || !expectedProject || !PROJECT_REF.test(expectedProject)
    || actualProject !== expectedProject || !deploymentIdentity || deploymentIdentity.length > 128
    || !stepUp || !UUID.test(stepUp) || !approvalReference) {
    throw new OrganizationProvisioningError('INVALID_TARGET_ENVIRONMENT');
  }
  return { environment: 'production', project_ref: expectedProject,
    deployment_identity: deploymentIdentity, step_up_session_id: stepUp, approval_reference: approvalReference };
}

export function assertOrganizationProvisioningEnabled(environment: NodeJS.ProcessEnv): void {
  if (environment.ORGANIZATION_PROVISIONING_ENABLED !== 'true') {
    throw new OrganizationProvisioningError('PROVISIONING_DISABLED');
  }
}
