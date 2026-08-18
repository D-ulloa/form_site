export type OrganizationErrorCode =
  | 'ALREADY_A_MEMBER'
  | 'DEPENDENCY_NOT_READY'
  | 'FORBIDDEN'
  | 'INVITATION_ALREADY_PENDING'
  | 'INVITATION_INVALID'
  | 'LAST_OWNER_REQUIRED'
  | 'NOT_FOUND'
  | 'ORGANIZATION_PENDING_DELETION'
  | 'ORGANIZATION_SUSPENDED'
  | 'POLICY_NOT_AVAILABLE'
  | 'VERSION_CONFLICT';

const statusByCode: Readonly<Record<OrganizationErrorCode, number>> = {
  ALREADY_A_MEMBER: 409,
  DEPENDENCY_NOT_READY: 503,
  FORBIDDEN: 403,
  INVITATION_ALREADY_PENDING: 409,
  INVITATION_INVALID: 410,
  LAST_OWNER_REQUIRED: 409,
  NOT_FOUND: 404,
  ORGANIZATION_PENDING_DELETION: 423,
  ORGANIZATION_SUSPENDED: 423,
  POLICY_NOT_AVAILABLE: 409,
  VERSION_CONFLICT: 409,
};

export class OrganizationDomainError extends Error {
  readonly code: OrganizationErrorCode;
  readonly http_status: number;

  constructor(code: OrganizationErrorCode, message: string = code) {
    super(message);
    this.name = 'OrganizationDomainError';
    this.code = code;
    this.http_status = statusByCode[code];
  }
}

export function mapOrganizationPersistenceError(error: { message: string }): never {
  const knownCodes = Object.keys(statusByCode) as OrganizationErrorCode[];
  const code = knownCodes.find((candidate) => error.message.includes(candidate));
  if (code) throw new OrganizationDomainError(code);
  if (error.message.includes('organization_invitations_one_pending_idx')) {
    throw new OrganizationDomainError('INVITATION_ALREADY_PENDING');
  }
  if (error.message.includes('organizations_slug_key')) {
    throw new OrganizationDomainError('VERSION_CONFLICT', 'Organization slug is already reserved.');
  }
  throw new Error(`Organization persistence failed: ${error.message}`);
}
