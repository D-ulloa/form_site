import { randomUUID } from 'node:crypto';
import { getContractRoleSchema, getContractSchemaDefinition } from '../config/contractSchemas.js';
import type {
  ContractEntryRecord,
  ContractEntrySummary,
  ContractRole,
  ContractSubmissionMetadata,
  ContractValidationIssue,
} from '../contracts/types.js';
import type { ContractEntryRepository } from './contractEntryRepository.js';
import { validateContractRoleSubmissionFields } from './validateContractRoleSubmission.js';
import {
  generateContractAccessToken,
  hashContractAccessToken,
} from './contractTokenService.js';

export interface ContractEntryLinks {
  readonly entryId: string;
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

export function toContractEntrySummary(entry: ContractEntryRecord): ContractEntrySummary {
  return {
    entryId: entry.id,
    schemaId: entry.schemaId,
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

  await repository.createEntry({
    id: entryId,
    schemaId: input.schemaId,
    createdBy: input.createdBy,
    createdAt,
    userTokenHash: hashContractAccessToken(userToken, environment),
    clientTokenHash: hashContractAccessToken(clientToken, environment),
  });

  const baseUrl = normalizeBaseUrl(input.publicBaseUrl);
  return {
    entryId,
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

export async function submitContractEntryRole(
  input: {
    readonly entry: ContractEntryRecord;
    readonly role: ContractRole;
    readonly authorizedTokenHash: string | null;
    readonly fields: Readonly<Record<string, unknown>>;
    readonly metadata: ContractSubmissionMetadata;
  },
  repository: ContractEntryRepository,
  dependencies: {
    readonly generateSubmissionId?: () => string;
    readonly environment?: NodeJS.ProcessEnv;
  } = {},
): Promise<SubmitContractEntryRoleResult> {
  const roleSchema = getContractRoleSchema(input.entry.schemaId, input.role);
  const validation = validateContractRoleSubmissionFields({
    entry: input.entry,
    role: input.role,
    roleSchema,
    fields: input.fields,
  }, dependencies.environment);
  if (!validation.success) throw new ContractRoleValidationError(validation.errors);

  const submissionId = (dependencies.generateSubmissionId ?? randomUUID)();
  const entry = await repository.saveRoleSubmission({
    entryId: input.entry.id,
    authorizedTokenHash: input.authorizedTokenHash,
    role: input.role,
    fields: sanitizeFields(validation.fields),
    metadata: input.metadata,
    submittedAt: input.metadata.receivedAt,
    submissionId,
  });

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
