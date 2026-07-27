export type ContractFieldType =
  | 'string'
  | 'email'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select';

export type ContractFieldValue = string | number | boolean;

export interface ContractFieldDefinition {
  readonly name: string;
  readonly label: string;
  readonly type: ContractFieldType;
  readonly required: boolean;
  readonly sensitive?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: string;
  readonly maxLength?: number;
  readonly options?: readonly string[];
}

export interface ContractSectionDefinition {
  readonly title: string;
  readonly fields: readonly ContractFieldDefinition[];
}

export interface ContractSchemaDefinition {
  readonly schemaId: string;
  readonly contractType: string;
  readonly sections: readonly ContractSectionDefinition[];
  readonly columnMap: Readonly<Record<string, string>>;
}

export interface PublicContractSchema {
  readonly schemaId: string;
  readonly contractType: string;
  readonly googleFormLink: string;
  readonly sections: readonly ContractSectionDefinition[];
}

export interface ContractSheetConfig {
  readonly spreadsheetId: string;
  readonly sheetName: string;
  readonly columnMap: Readonly<Record<string, string>>;
}

export interface ContractSchemaConfig extends PublicContractSchema {
  readonly sheet: ContractSheetConfig;
}

export interface ContractSubmissionMeta {
  readonly userId: string;
  readonly origin: string;
}

export interface ContractSubmissionRequest {
  readonly contractType: string;
  readonly schemaId: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly meta: ContractSubmissionMeta;
}

export interface ValidatedContractSubmission {
  readonly contractType: string;
  readonly schemaId: string;
  readonly fields: Readonly<Record<string, ContractFieldValue>>;
  readonly meta: ContractSubmissionMeta;
}

export type ContractValidationIssueCode =
  | 'invalid_request'
  | 'unknown_schema'
  | 'contract_type_mismatch'
  | 'required'
  | 'unknown_field'
  | 'invalid_type'
  | 'invalid_email'
  | 'invalid_date'
  | 'min'
  | 'max'
  | 'max_length'
  | 'pattern'
  | 'invalid_option'
  | 'invalid_schema';

export interface ContractValidationIssue {
  readonly path: string;
  readonly code: ContractValidationIssueCode;
  readonly message: string;
}

export type ContractValidationResult =
  | {
      readonly success: true;
      readonly data: ValidatedContractSubmission;
    }
  | {
      readonly success: false;
      readonly errors: readonly ContractValidationIssue[];
    };

export interface MappedContractSheetRow {
  readonly fieldNames: readonly string[];
  readonly columnHeaders: readonly string[];
  readonly values: readonly ContractFieldValue[];
}

export type ContractRole = 'user' | 'client';
export type ContractEntryStatus = 'open' | 'complete' | 'archived';

export interface ContractRoleSchema {
  readonly schemaId: string;
  readonly contractType: string;
  readonly role: ContractRole;
  readonly sections: readonly ContractSectionDefinition[];
}

export interface ContractEntryRecord {
  readonly id: string;
  readonly schemaId: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly userTokenHash: string;
  readonly clientTokenHash: string;
  readonly userFilled: boolean;
  readonly clientFilled: boolean;
  readonly userSubmittedAt: string | null;
  readonly clientSubmittedAt: string | null;
  readonly userSubmission: Readonly<Record<string, ContractFieldValue>> | null;
  readonly clientSubmission: Readonly<Record<string, ContractFieldValue>> | null;
  readonly combinedSubmission: Readonly<Record<string, unknown>> | null;
  readonly status: ContractEntryStatus;
  readonly archivedAt: string | null;
}

export interface ContractEntrySummary {
  readonly entryId: string;
  readonly schemaId: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly userFilled: boolean;
  readonly clientFilled: boolean;
  readonly userSubmittedAt: string | null;
  readonly clientSubmittedAt: string | null;
  readonly status: ContractEntryStatus;
  readonly archivedAt: string | null;
}

export interface ContractSubmissionMetadata {
  readonly ip: string;
  readonly userAgent: string;
  readonly receivedAt: string;
}
