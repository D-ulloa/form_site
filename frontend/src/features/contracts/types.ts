export type ContractFieldType =
  | 'string'
  | 'email'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select';

export interface ContractSelectOption {
  value: string;
  label: string;
}

export type ContractFieldOption = string | ContractSelectOption;

export interface ContractField {
  name: string;
  label: string;
  type: ContractFieldType;
  required: boolean;
  sensitive?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  maxLength?: number;
  options?: ContractFieldOption[];
}

export interface ContractSection {
  title: string;
  fields: ContractField[];
}

export interface ContractPublicSchema {
  schemaId: string;
  contractType: string;
  googleFormLink: string;
  sections: ContractSection[];
}

export type ContractFieldValue = string | number | boolean;
export type ContractFormValues = Record<string, ContractFieldValue>;

export interface ContractSubmitRequest {
  contractType: string;
  schemaId: string;
  fields: Record<string, ContractFieldValue>;
  meta: {
    userId: string;
    origin: 'ui';
  };
}

export interface ContractReceipt {
  submissionId: string;
  timestamp: string;
  sheetUrl: string;
  appendedRange: string;
  auditUrl: string;
}

export interface ContractSubmitResponse {
  receipt: ContractReceipt;
}

export interface ContractFieldApiError {
  field?: string;
  message: string;
}

export interface ContractApiErrorBody {
  error?: string;
  message?: string;
  details?: string | string[];
  errors?: Array<string | ContractFieldApiError>;
  retriable?: boolean;
}

type ContractSchemaSections = Pick<ContractPublicSchema, 'sections'>;

export function getContractFields(schema: ContractSchemaSections): ContractField[] {
  return schema.sections.flatMap((section) => section.fields);
}

export function buildContractDefaultValues(
  schema: ContractSchemaSections,
  values: ContractFormValues = {},
): ContractFormValues {
  return Object.fromEntries(
    getContractFields(schema).map((field) => [
      field.name,
      values[field.name] ?? (field.type === 'boolean' ? false : ''),
    ]),
  );
}

export function normalizeContractFields(
  schema: ContractSchemaSections,
  values: ContractFormValues,
): Record<string, ContractFieldValue> {
  const normalized: Record<string, ContractFieldValue> = {};

  for (const field of getContractFields(schema)) {
    const rawValue = values[field.name];

    if (field.type === 'boolean') {
      normalized[field.name] = rawValue === true;
      continue;
    }

    if (rawValue === undefined || rawValue === '') {
      if (field.required) normalized[field.name] = '';
      continue;
    }

    if (field.type === 'number') {
      const numberValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (Number.isFinite(numberValue)) normalized[field.name] = numberValue;
      continue;
    }

    const stringValue = String(rawValue).trim();
    if (stringValue !== '' || field.required) {
      normalized[field.name] = stringValue;
    }
  }

  return normalized;
}

export type ContractRole = 'user' | 'client';
export type ContractEntryStatus = 'open' | 'complete' | 'archived';

export interface ContractEntrySummary {
  entryId: string;
  schemaId: string;
  createdBy: string;
  createdAt: string;
  userFilled: boolean;
  clientFilled: boolean;
  userSubmittedAt: string | null;
  clientSubmittedAt: string | null;
  status: ContractEntryStatus;
  archivedAt: string | null;
}

export interface ContractEntryLinks {
  entryId: string;
  userUrl: string;
  clientUrl: string;
  createdAt: string;
  status: 'open';
}

export interface ContractRoleSchemaResponse {
  schemaId: string;
  contractType: string;
  role: ContractRole;
  sections: ContractSection[];
  entry: ContractEntrySummary;
  readOnly: boolean;
  values: ContractFormValues;
}

export interface ContractRoleSubmitResponse {
  submissionId: string;
  entryId: string;
  status: 'open' | 'complete';
  submittedAt: string;
}

export interface ContractAdminEntryDetail {
  entry: ContractEntrySummary;
  userSubmission: ContractFormValues | null;
  clientSubmission: ContractFormValues | null;
  combinedSubmission: Record<string, unknown> | null;
}

export function getContractEntryWaitingStatus(entry: ContractEntrySummary): string {
  if (entry.status === 'archived') return 'archived';
  if (entry.status === 'complete') return 'complete';
  if (entry.userFilled) return 'waiting for client';
  if (entry.clientFilled) return 'waiting for user';
  return 'waiting for user and client';
}
