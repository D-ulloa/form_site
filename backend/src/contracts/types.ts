export type ContractFieldType =
  | 'string'
  | 'email'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select';

export type ContractFieldValue = string | number | boolean;
export type ContractComputedField =
  | 'formatted_start'
  | 'formatted_update';

export interface ContractFieldDefinition {
  readonly name: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly type: ContractFieldType;
  readonly required: boolean;
  readonly sensitive?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: string;
  readonly maxLength?: number;
  readonly options?: readonly string[];
  readonly integer?: boolean;
  readonly readOnly?: boolean;
  readonly computed?: ContractComputedField;
}

export interface ContractSectionDefinition {
  readonly title: string;
  readonly fields: readonly ContractFieldDefinition[];
}

export type ContractRepeatableCollection = 'inquilinos' | 'garantes';
export type ContractDniImageSlot = 'front' | 'back';
export type ContractEvidenceFileField =
  | 'recibo_sueldo_files'
  | 'garantia_propietaria_files';

export interface ContractRepeatableDefinition {
  readonly name: ContractRepeatableCollection;
  readonly itemLabel: string;
  readonly addLabel: string;
  readonly minItems: 1;
}

export interface ContractDniUploadDefinition {
  readonly name: string;
  readonly label: string;
  readonly slot: ContractDniImageSlot;
  readonly required: boolean;
}

export interface ContractFileReceiverDefinition {
  readonly name: ContractEvidenceFileField;
  readonly label: string;
  readonly maxFiles: 2;
  readonly maxSizeBytes: number;
  readonly acceptedMimeTypes: readonly string[];
}

export interface ContractSubsectionDefinition {
  readonly title: string;
  readonly fieldNames: readonly string[];
  readonly fileReceivers?: readonly ContractFileReceiverDefinition[];
}

export interface ContractRoleSectionDefinition extends ContractSectionDefinition {
  readonly repeatable?: ContractRepeatableDefinition;
  readonly uploads?: readonly ContractDniUploadDefinition[];
  readonly subsections?: readonly ContractSubsectionDefinition[];
}

export interface ContractDniImageReference {
  readonly originalName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storagePath: string;
  readonly storageBucket: string;
  readonly publicPath: string;
  readonly slot: ContractDniImageSlot;
}

export interface ContractEvidenceFileReference {
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly storagePath: string;
  readonly storageBucket: string;
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
export type ContractEntryStatus = 'open' | 'complete' | 'archived' | 'generar_contrato';

export interface ContractRoleSchema {
  readonly schemaId: string;
  readonly contractType: string;
  readonly role: ContractRole;
  readonly sections: readonly ContractRoleSectionDefinition[];
}

export interface ContractEntryRecord {
  readonly id: string;
  readonly schemaId: string;
  readonly direccion?: string | null;
  readonly createdBy: string;
  /** Null/undefined identifies rows created before SPEC-22 ownership tracking. */
  readonly createdByUserId?: string | null;
  readonly createdAt: string;
  readonly userTokenHash: string;
  readonly clientTokenHash: string;
  readonly userFilled: boolean;
  readonly clientFilled: boolean;
  readonly userSubmittedAt: string | null;
  readonly clientSubmittedAt: string | null;
  readonly userSubmission: Readonly<Record<string, unknown>> | null;
  readonly clientSubmission: Readonly<Record<string, unknown>> | null;
  readonly combinedSubmission: Readonly<Record<string, unknown>> | null;
  readonly status: ContractEntryStatus;
  readonly archivedAt: string | null;
}

export interface ContractEntrySummary {
  readonly entryId: string;
  readonly schemaId: string;
  readonly direccion?: string | null;
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

export interface ContractSubmissionRecord {
  readonly id: string;
  readonly entryId: string;
  readonly role: ContractRole;
  readonly submission: Readonly<Record<string, unknown>>;
  readonly metadata: ContractSubmissionMetadata;
  readonly submittedAt: string;
}

export interface ContractAdminInspectionField {
  readonly name: string;
  readonly label: string;
  readonly type: ContractFieldType;
  readonly value: unknown;
}

export interface ContractAdminInspectionSubsection {
  readonly title: string;
  readonly fields: readonly ContractAdminInspectionField[];
  readonly media: readonly ContractAdminInspectionEvidenceMedia[];
}

export interface ContractAdminInspectionEvidenceMedia {
  readonly fieldName: ContractEvidenceFileField;
  readonly label: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly viewUrl: string;
  readonly expiresAt: string;
}

export interface ContractAdminInspectionMedia {
  readonly fieldName: string;
  readonly label: string;
  readonly slot: ContractDniImageSlot;
  readonly originalName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly viewUrl: string;
  readonly expiresAt: string;
}

export interface ContractAdminInspectionItem {
  readonly index: number;
  readonly label: string;
  readonly fields: readonly ContractAdminInspectionField[];
  readonly subsections: readonly ContractAdminInspectionSubsection[];
  readonly media: readonly ContractAdminInspectionMedia[];
}

export interface ContractAdminInspectionSection {
  readonly title: string;
  readonly fields: readonly ContractAdminInspectionField[];
  readonly subsections: readonly ContractAdminInspectionSubsection[];
  readonly items: readonly ContractAdminInspectionItem[];
}

export interface ContractAdminInspectionSubmission {
  readonly submissionId: string;
  readonly role: ContractRole;
  readonly submittedAt: string;
  readonly sections: readonly ContractAdminInspectionSection[];
}

export interface ContractAdminInspection {
  readonly hasSubmissions: boolean;
  readonly submissions: readonly ContractAdminInspectionSubmission[];
}
