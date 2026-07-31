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
export type ContractComputedField = 'formatted_start' | 'formatted_update';

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
  integer?: boolean;
  readOnly?: boolean;
  computed?: ContractComputedField;
}

export type ContractRepeatableCollection = 'inquilinos' | 'garantes';
export type ContractDniImageSlot = 'front' | 'back';

export interface ContractRepeatableDefinition {
  name: ContractRepeatableCollection;
  itemLabel: string;
  addLabel: string;
  minItems: 1;
}

export interface ContractDniUploadDefinition {
  name: string;
  label: string;
  slot: ContractDniImageSlot;
  required: boolean;
}

export interface ContractFileReceiverDefinition {
  name: 'recibo_sueldo_files' | 'garantia_propietaria_files';
  label: string;
  maxFiles: 2;
  maxSizeBytes: number;
  acceptedMimeTypes: string[];
}

export interface ContractSubsectionDefinition {
  title: string;
  fieldNames: string[];
  fileReceivers?: ContractFileReceiverDefinition[];
}

export interface ContractSection {
  title: string;
  fields: ContractField[];
  repeatable?: ContractRepeatableDefinition;
  uploads?: ContractDniUploadDefinition[];
  subsections?: ContractSubsectionDefinition[];
}

export interface ContractDniImageReference {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  storageBucket: string;
  publicPath: string;
  viewUrl?: string;
  downloadUrl?: string;
  expiresAt?: string;
  slot: ContractDniImageSlot;
}

export interface ContractDniPresignedUpload extends ContractDniImageReference {
  uploadUrl: string;
}

export interface ContractDniUploadDescriptor {
  collection: ContractRepeatableCollection;
  itemIndex: number;
  slot: ContractDniImageSlot;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ContractEvidenceFileReference {
  filename: string;
  mimeType: string;
  viewUrl?: string;
  downloadUrl?: string;
  expiresAt?: string;
  size: number;
  storagePath: string;
  storageBucket: string;
}

export type ContractEvidenceFileValue = File | ContractEvidenceFileReference;

export function isContractEvidenceFileReference(
  value: unknown,
): value is ContractEvidenceFileReference {
  return typeof value === 'object' && value !== null &&
    typeof (value as Record<string, unknown>).filename === 'string' &&
    typeof (value as Record<string, unknown>).mimeType === 'string' &&
    typeof (value as Record<string, unknown>).size === 'number' &&
    typeof (value as Record<string, unknown>).storagePath === 'string' &&
    typeof (value as Record<string, unknown>).storageBucket === 'string';
}

export interface ContractEvidenceUploadDescriptor {
  collection: 'garantes';
  itemIndex: number;
  field: ContractFileReceiverDefinition['name'];
  filename: string;
  mimeType: string;
  size: number;
}

export interface ContractEvidencePresignedUpload extends ContractEvidenceFileReference {
  uploadUrl: string;
}

export interface ContractPublicSchema {
  schemaId: string;
  contractType: string;
  googleFormLink: string;
  sections: ContractSection[];
}

export type ContractFieldValue = string | number | boolean;
export type ContractFormValues = Record<string, unknown>;

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

export function getContractFileReceivers(
  section: ContractSection,
): ContractFileReceiverDefinition[] {
  return section.subsections?.flatMap(
    (subsection) => subsection.fileReceivers ?? [],
  ) ?? [];
}

export function buildContractDefaultValues(
  schema: ContractSchemaSections,
  values: ContractFormValues = {},
): ContractFormValues {
  const defaults: ContractFormValues = {};
  for (const section of schema.sections) {
    if (section.repeatable) {
      const existing = values[section.repeatable.name];
      const existingItems = Array.isArray(existing) ? existing : [];
      defaults[section.repeatable.name] = (existingItems.length > 0 ? existingItems : [{}])
        .map((item) => {
          const source = typeof item === 'object' && item !== null
            ? item as Record<string, unknown>
            : {};
          return {
            ...Object.fromEntries(section.fields.map((field) => [
              field.name,
              source[field.name] ?? (field.type === 'boolean' ? false : ''),
            ])),
            ...Object.fromEntries((section.uploads ?? [])
              .filter((upload) => source[upload.name] !== undefined)
              .map((upload) => [upload.name, source[upload.name]])),
            ...Object.fromEntries(getContractFileReceivers(section)
              .filter((receiver) => source[receiver.name] !== undefined)
              .map((receiver) => [receiver.name, source[receiver.name]])),
          };
        });
      continue;
    }
    for (const field of section.fields) {
      defaults[field.name] = values[field.name] ?? (field.type === 'boolean' ? false : '');
    }
  }
  return defaults;
}

function normalizeFieldValue(field: ContractField, rawValue: unknown): ContractFieldValue | undefined {
  if (field.computed) return undefined;
  if (field.type === 'boolean') return rawValue === true;
  if (rawValue === undefined || rawValue === '') return field.required ? '' : undefined;
  if (field.type === 'number') {
    const numberValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }
  const stringValue = String(rawValue).trim();
  return stringValue !== '' || field.required ? stringValue : undefined;
}

export function normalizeContractFields(
  schema: ContractSchemaSections,
  values: ContractFormValues,
): Record<string, ContractFieldValue> {
  const normalized: Record<string, ContractFieldValue> = {};

  for (const field of getContractFields(schema)) {
    const value = normalizeFieldValue(field, values[field.name]);
    if (value !== undefined) normalized[field.name] = value;
  }

  return normalized;
}

export function normalizeContractRoleFields(
  schema: ContractSchemaSections,
  values: ContractFormValues,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const section of schema.sections) {
    if (!section.repeatable) {
      for (const field of section.fields) {
        const value = normalizeFieldValue(field, values[field.name]);
        if (value !== undefined) normalized[field.name] = value;
      }
      continue;
    }
    const rawItems = values[section.repeatable.name];
    normalized[section.repeatable.name] = (Array.isArray(rawItems) ? rawItems : []).map((item) => {
      const source = typeof item === 'object' && item !== null
        ? item as Record<string, unknown>
        : {};
      const normalizedItem: Record<string, unknown> = {};
      for (const field of section.fields) {
        const value = normalizeFieldValue(field, source[field.name]);
        if (value !== undefined) normalizedItem[field.name] = value;
      }
      for (const upload of section.uploads ?? []) {
        if (source[upload.name] !== undefined) normalizedItem[upload.name] = source[upload.name];
      }
      for (const receiver of getContractFileReceivers(section)) {
        if (source[receiver.name] !== undefined) {
          normalizedItem[receiver.name] = source[receiver.name];
        }
      }
      return normalizedItem;
    });
  }
  return normalized;
}

function hasMeaningfulContractValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

export interface MissingContractSubsection {
  collection: ContractRepeatableCollection;
  itemIndex: number;
}

export function getMissingContractSubsections(
  schema: ContractSchemaSections,
  values: ContractFormValues,
): MissingContractSubsection[] {
  const missing: MissingContractSubsection[] = [];

  for (const section of schema.sections) {
    const repeatable = section.repeatable;
    if (!repeatable || !section.subsections?.length) continue;
    const rawItems = values[repeatable.name];
    const items = Array.isArray(rawItems) ? rawItems : [];

    items.forEach((item, itemIndex) => {
      const itemValues = typeof item === 'object' && item !== null
        ? item as Record<string, unknown>
        : {};
      const hasSubsectionData = section.subsections?.some((subsection) =>
        subsection.fieldNames.some((fieldName) =>
          hasMeaningfulContractValue(itemValues[fieldName])));

      if (!hasSubsectionData) {
        missing.push({
          collection: repeatable.name,
          itemIndex,
        });
      }
    });
  }

  return missing;
}

export interface MissingContractEvidence {
  collection: 'garantes';
  itemIndex: number;
}

export function getMissingContractEvidence(
  schema: ContractSchemaSections,
  values: ContractFormValues,
): MissingContractEvidence[] {
  const missing: MissingContractEvidence[] = [];

  for (const section of schema.sections) {
    if (section.repeatable?.name !== 'garantes') continue;
    const receivers = getContractFileReceivers(section);
    if (receivers.length === 0) continue;
    const rawItems = values.garantes;
    const items = Array.isArray(rawItems) ? rawItems : [];

    items.forEach((item, itemIndex) => {
      const itemValues = typeof item === 'object' && item !== null
        ? item as Record<string, unknown>
        : {};
      const totalFiles = receivers.reduce((total, receiver) => {
        const files = itemValues[receiver.name];
        return total + (Array.isArray(files) ? files.length : 0);
      }, 0);
      if (totalFiles === 0) missing.push({ collection: 'garantes', itemIndex });
    });
  }

  return missing;
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
  inspection: ContractEntryInspection;
}

export interface ContractInspectionField {
  name: string;
  label: string;
  type: ContractFieldType;
  value: unknown;
}

export interface ContractInspectionSubsection {
  title: string;
  fields: ContractInspectionField[];
  media: ContractInspectionEvidenceMedia[];
}

export interface ContractInspectionDniMedia {
  fieldName: string;
  label: string;
  slot: ContractDniImageSlot;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  viewUrl: string;
  expiresAt: string;
}

export interface ContractInspectionEvidenceMedia {
  fieldName: ContractFileReceiverDefinition['name'];
  label: string;
  filename: string;
  mimeType: string;
  size: number;
  viewUrl: string;
  expiresAt: string;
}

export type ContractInspectionMedia =
  | ContractInspectionDniMedia
  | ContractInspectionEvidenceMedia;

export interface ContractInspectionItem {
  index: number;
  label: string;
  fields: ContractInspectionField[];
  subsections: ContractInspectionSubsection[];
  media: ContractInspectionMedia[];
}

export interface ContractInspectionSection {
  title: string;
  fields: ContractInspectionField[];
  subsections: ContractInspectionSubsection[];
  items: ContractInspectionItem[];
}

export interface ContractInspectionSubmission {
  submissionId: string;
  role: ContractRole;
  submittedAt: string;
  sections: ContractInspectionSection[];
}

export interface ContractEntryInspection {
  hasSubmissions: boolean;
  submissions: ContractInspectionSubmission[];
}

export function getContractEntryWaitingStatus(entry: ContractEntrySummary): string {
  if (entry.status === 'archived') return 'Archivado';
  if (entry.status === 'complete') return 'Completo';
  if (entry.userFilled) return 'Esperando al cliente';
  if (entry.clientFilled) return 'Esperando la información del contrato';
  return 'Esperando ambos formularios';
}
