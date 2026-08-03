import { randomUUID } from 'node:crypto';
import { getContractRoleSchema, getContractSchemaDefinition } from '../config/contractSchemas.js';
import type {
  ContractEntryRecord,
  ContractEntrySummary,
  ContractEvidenceFileField,
  ContractEvidenceFileReference,
  ContractRole,
  ContractSubmissionMetadata,
  ContractValidationIssue,
} from '../contracts/types.js';
import type { ContractEntryRepository } from './contractEntryRepository.js';
import {
  verifyContractEvidenceReferences,
  type ContractEvidenceReferenceVerificationTarget,
  type ContractEvidenceReferenceVerifier,
} from './contractEvidenceUploadService.js';
import { validateContractRoleSubmissionFields } from './validateContractRoleSubmission.js';
import {
  generateContractAccessToken,
  hashContractAccessToken,
} from './contractTokenService.js';

export interface ContractEntryLinks {
  readonly entryId: string;
  readonly direccion: string;
  readonly adminUrl: string;
  readonly userUrl: string;
  readonly clientUrl: string;
  readonly createdAt: string;
  readonly status: 'open';
}

export interface SubmitContractEntryRoleResult {
  readonly submissionId: string;
  readonly entryId: string;
  readonly status: 'open' | 'complete';
  readonly submittedAt: string;
}

export class ContractRoleValidationError extends Error {
  readonly errors: readonly ContractValidationIssue[];

  constructor(errors: readonly ContractValidationIssue[]) {
    super('Contract role submission validation failed.');
    this.name = 'ContractRoleValidationError';
    this.errors = errors;
  }
}

export class ContractPublicBaseUrlConfigurationError extends Error {
  constructor() {
    super('CONTRACT_PUBLIC_BASE_URL must be an absolute HTTP or HTTPS frontend URL.');
    this.name = 'ContractPublicBaseUrlConfigurationError';
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new ContractPublicBaseUrlConfigurationError();
    }
    return url.toString().replace(/\/$/u, '');
  } catch (error) {
    if (error instanceof ContractPublicBaseUrlConfigurationError) throw error;
    throw new ContractPublicBaseUrlConfigurationError();
  }
}

function buildRoleUrl(
  baseUrl: string,
  entryId: string,
  role: ContractRole,
  token: string,
): string {
  const url = new URL(`/contracts/${encodeURIComponent(entryId)}/${role}`, `${baseUrl}/`);
  url.searchParams.set('token', token);
  return url.toString();
}

function buildAdminUrl(baseUrl: string, entryId: string): string {
  return new URL(`/contracts/admin/${encodeURIComponent(entryId)}`, `${baseUrl}/`).toString();
}

export function toContractEntrySummary(entry: ContractEntryRecord): ContractEntrySummary {
  return {
    entryId: entry.id,
    schemaId: entry.schemaId,
    direccion: entry.direccion ?? null,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt,
    userFilled: entry.userFilled,
    clientFilled: entry.clientFilled,
    userSubmittedAt: entry.userSubmittedAt,
    clientSubmittedAt: entry.clientSubmittedAt,
    status: entry.status,
    archivedAt: entry.archivedAt,
  };
}

export async function createContractEntry(
  input: {
    readonly schemaId: string;
    readonly createdBy: string;
    readonly publicBaseUrl: string;
    readonly direccion?: string;
  },
  repository: ContractEntryRepository,
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: {
    readonly now?: () => Date;
    readonly generateId?: () => string;
    readonly generateToken?: () => string;
  } = {},
): Promise<ContractEntryLinks> {
  getContractSchemaDefinition(input.schemaId);
  const now = dependencies.now ?? (() => new Date());
  const generateId = dependencies.generateId ?? randomUUID;
  const generateToken = dependencies.generateToken ?? generateContractAccessToken;
  const createdAt = now().toISOString();
  const entryId = generateId();
  const userToken = generateToken();
  const clientToken = generateToken();
  const direccion = input.direccion?.trim() || 'Sin dirección';

  await repository.createEntry({
    id: entryId,
    schemaId: input.schemaId,
    direccion,
    createdBy: input.createdBy,
    createdAt,
    userTokenHash: hashContractAccessToken(userToken, environment),
    clientTokenHash: hashContractAccessToken(clientToken, environment),
  });

  const baseUrl = normalizeBaseUrl(input.publicBaseUrl);
  return {
    entryId,
    direccion,
    adminUrl: buildAdminUrl(baseUrl, entryId),
    userUrl: buildRoleUrl(baseUrl, entryId, 'user', userToken),
    clientUrl: buildRoleUrl(baseUrl, entryId, 'client', clientToken),
    createdAt,
    status: 'open',
  };
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/[\u0000\u000B\u000C\u000E-\u001F\u007F]/gu, '');
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([name, nestedValue]) => [name, sanitizeValue(nestedValue)]),
    );
  }
  return value;
}

function sanitizeFields(
  fields: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [name, sanitizeValue(value)]),
  );
}

const CONTRACT_EVIDENCE_FIELDS = [
  'recibo_sueldo_files',
  'garantia_propietaria_files',
] as const satisfies readonly ContractEvidenceFileField[];

function collectContractEvidenceReferences(
  fields: Readonly<Record<string, unknown>>,
): readonly ContractEvidenceReferenceVerificationTarget[] {
  const guarantors = fields.garantes;
  if (!Array.isArray(guarantors)) return [];

  const targets: ContractEvidenceReferenceVerificationTarget[] = [];
  guarantors.forEach((rawGuarantor, itemIndex) => {
    if (typeof rawGuarantor !== 'object' || rawGuarantor === null) return;
    const guarantor = rawGuarantor as Readonly<Record<string, unknown>>;
    for (const field of CONTRACT_EVIDENCE_FIELDS) {
      const rawReferences = guarantor[field];
      if (!Array.isArray(rawReferences)) continue;
      rawReferences.forEach((rawReference, fileIndex) => {
        targets.push({
          path: `fields.garantes.${itemIndex}.${field}.${fileIndex}`,
          reference: rawReference as ContractEvidenceFileReference,
        });
      });
    }
  });
  return targets;
}

export async function submitContractEntryRole(
  input: {
    readonly entry: ContractEntryRecord;
    readonly role: ContractRole;
    readonly authorizedTokenHash: string | null;
    readonly fields: Readonly<Record<string, unknown>>;
    readonly metadata: ContractSubmissionMetadata;
    readonly mode?: "create" | "update";
  },
  repository: ContractEntryRepository,
  dependencies: {
    readonly generateSubmissionId?: () => string;
    readonly environment?: NodeJS.ProcessEnv;
    readonly verifyEvidenceReferences?: ContractEvidenceReferenceVerifier;
  } = {},
): Promise<SubmitContractEntryRoleResult> {
  const environment = dependencies.environment ?? process.env;
  const roleSchema = getContractRoleSchema(
    input.entry.schemaId,
    input.role,
    environment,
  );
  const validation = validateContractRoleSubmissionFields({
    entry: input.entry,
    role: input.role,
    roleSchema,
    fields: input.fields,
  }, environment);
  if (!validation.success) throw new ContractRoleValidationError(validation.errors);
  if (input.role === 'client') {
    const evidenceErrors = await (
      dependencies.verifyEvidenceReferences ?? verifyContractEvidenceReferences
    )(
      collectContractEvidenceReferences(validation.fields),
      environment,
    );
    if (evidenceErrors.length > 0) throw new ContractRoleValidationError(evidenceErrors);
  }

  const submissionId = (dependencies.generateSubmissionId ?? randomUUID)();
  const submissionInput = {
    entryId: input.entry.id,
    authorizedTokenHash: input.authorizedTokenHash,
    role: input.role,
    fields: sanitizeFields(validation.fields),
    metadata: input.metadata,
    submittedAt: input.metadata.receivedAt,
    submissionId,
  };
  const entry = input.mode === "update" && repository.updateRoleSubmission
    ? await repository.updateRoleSubmission(submissionInput)
    : await repository.saveRoleSubmission(submissionInput);

  return {
    submissionId,
    entryId: entry.id,
    status: entry.status === 'complete' ? 'complete' : 'open',
    submittedAt: input.metadata.receivedAt,
  };
}

export async function regenerateContractRoleToken(
  input: {
    readonly entryId: string;
    readonly role: ContractRole;
    readonly publicBaseUrl: string;
  },
  repository: ContractEntryRepository,
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: {
    readonly now?: () => Date;
    readonly generateToken?: () => string;
  } = {},
): Promise<{ readonly role: ContractRole; readonly url: string }> {
  const token = (dependencies.generateToken ?? generateContractAccessToken)();
  const occurredAt = (dependencies.now ?? (() => new Date()))().toISOString();
  await repository.replaceTokenHash(
    input.entryId,
    input.role,
    hashContractAccessToken(token, environment),
    occurredAt,
  );
  return {
    role: input.role,
    url: buildRoleUrl(normalizeBaseUrl(input.publicBaseUrl), input.entryId, input.role, token),
  };
}
