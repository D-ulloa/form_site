import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ContractFieldValue,
  ContractSchemaDefinition,
  MappedContractSheetRow,
} from '../contracts/types.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOGS_DIRECTORY = join(moduleDirectory, '..', '..', 'logs');
const SUBMISSION_ID_PATTERN = /^SUB-\d{4}-\d{2}-\d{2}-[A-F0-9]{8}$/u;

export const REDACTED_CONTRACT_VALUE = '[REDACTED]';

export interface ContractAuditInput {
  readonly schema: ContractSchemaDefinition;
  readonly fields: Readonly<Record<string, ContractFieldValue>>;
  readonly mappedRow: MappedContractSheetRow;
  readonly spreadsheetId: string;
  readonly sheetName: string;
  readonly appendedRange: string;
  readonly submissionId: string;
  readonly userId: string;
  readonly timestamp: string;
  readonly requestId: string;
  readonly ip: string;
}

export interface ContractAuditLog {
  readonly schemaId: string;
  readonly contractType: string;
  readonly fields: Readonly<Record<string, ContractFieldValue>>;
  readonly mappedRow: readonly ContractFieldValue[];
  readonly spreadsheetId: string;
  readonly sheetName: string;
  readonly appendedRange: string;
  readonly submissionId: string;
  readonly userId: string;
  readonly timestamp: string;
  readonly requestId: string;
  readonly ip: string;
}

export interface ContractAuditStorageOptions {
  readonly logsDirectory?: string;
}

export function resolveContractAuditLogsDirectory(
  options: ContractAuditStorageOptions = {},
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configuredDirectory = environment.CONTRACT_AUDIT_LOGS_DIR?.trim();
  return (
    options.logsDirectory ??
    (configuredDirectory === undefined || configuredDirectory.length === 0
      ? DEFAULT_LOGS_DIRECTORY
      : configuredDirectory)
  );
}

export class InvalidContractSubmissionIdError extends Error {
  constructor() {
    super('submissionId must match SUB-YYYY-MM-DD-XXXXXXXX.');
    this.name = 'InvalidContractSubmissionIdError';
  }
}

export class ContractAuditAlreadyExistsError extends Error {
  constructor(submissionId: string, cause: unknown) {
    super(`Audit ${submissionId} already exists and cannot be overwritten.`, { cause });
    this.name = 'ContractAuditAlreadyExistsError';
  }
}

export class ContractAuditNotFoundError extends Error {
  constructor(submissionId: string, cause: unknown) {
    super(`Audit ${submissionId} was not found.`, { cause });
    this.name = 'ContractAuditNotFoundError';
  }
}

export class ContractAuditIntegrityError extends Error {
  constructor(submissionId: string, cause?: unknown) {
    super(`Audit ${submissionId} is unreadable or does not match its file name.`, {
      cause,
    });
    this.name = 'ContractAuditIntegrityError';
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function getAuditPath(
  submissionId: string,
  options: ContractAuditStorageOptions,
): string {
  if (!SUBMISSION_ID_PATTERN.test(submissionId)) {
    throw new InvalidContractSubmissionIdError();
  }
  return join(
    resolveContractAuditLogsDirectory(options),
    `${submissionId}.json`,
  );
}

export function buildContractAuditLog(
  input: ContractAuditInput,
): ContractAuditLog {
  const sensitiveFields = new Set(
    input.schema.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.sensitive)
      .map((field) => field.name),
  );
  const fields: Record<string, ContractFieldValue> = {};

  for (const [fieldName, value] of Object.entries(input.fields)) {
    fields[fieldName] = sensitiveFields.has(fieldName)
      ? REDACTED_CONTRACT_VALUE
      : value;
  }

  const mappedRow = input.mappedRow.values.map((value, index) => {
    const fieldName = input.mappedRow.fieldNames[index];
    return fieldName !== undefined && sensitiveFields.has(fieldName)
      ? REDACTED_CONTRACT_VALUE
      : value;
  });

  return {
    schemaId: input.schema.schemaId,
    contractType: input.schema.contractType,
    fields,
    mappedRow,
    spreadsheetId: input.spreadsheetId,
    sheetName: input.sheetName,
    appendedRange: input.appendedRange,
    submissionId: input.submissionId,
    userId: input.userId,
    timestamp: input.timestamp,
    requestId: input.requestId,
    ip: input.ip,
  };
}

export async function persistContractAuditLog(
  audit: ContractAuditLog,
  options: ContractAuditStorageOptions = {},
): Promise<void> {
  const auditPath = getAuditPath(audit.submissionId, options);
  await mkdir(dirname(auditPath), { recursive: true });

  try {
    await writeFile(auditPath, JSON.stringify(audit, null, 2), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) {
      throw new ContractAuditAlreadyExistsError(audit.submissionId, error);
    }
    throw error;
  }
}

export async function readContractAuditLog(
  submissionId: string,
  options: ContractAuditStorageOptions = {},
): Promise<ContractAuditLog> {
  const auditPath = getAuditPath(submissionId, options);
  let raw: string;

  try {
    raw = await readFile(auditPath, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      throw new ContractAuditNotFoundError(submissionId, error);
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('submissionId' in parsed) ||
      parsed.submissionId !== submissionId
    ) {
      throw new ContractAuditIntegrityError(submissionId);
    }
    return parsed as ContractAuditLog;
  } catch (error) {
    if (error instanceof ContractAuditIntegrityError) throw error;
    throw new ContractAuditIntegrityError(submissionId, error);
  }
}
