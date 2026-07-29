import { getContractRoleSchema } from '../config/contractSchemas.js';
import type {
  ContractAdminInspection,
  ContractAdminInspectionField,
  ContractAdminInspectionItem,
  ContractAdminInspectionMedia,
  ContractAdminInspectionSection,
  ContractAdminInspectionSubsection,
  ContractAdminInspectionSubmission,
  ContractDniImageReference,
  ContractDniUploadDefinition,
  ContractEntryRecord,
  ContractFieldDefinition,
  ContractRepeatableCollection,
  ContractRole,
  ContractRoleSectionDefinition,
  ContractSubmissionRecord,
} from '../contracts/types.js';
import {
  CONTRACT_DNI_IMAGE_MIME_TYPES,
  getContractDniMaxImageBytes,
  getContractDniStorageBucket,
  issueContractDniViewUrl,
  type ContractDniSignedView,
} from './contractDniUploadService.js';

const INSPECTION_ROLE_ORDER = ['user', 'client'] as const satisfies readonly ContractRole[];

export interface ContractAdminInspectionDependencies {
  readonly issueDniViewUrl: (
    reference: ContractDniImageReference,
    environment: NodeJS.ProcessEnv,
  ) => Promise<ContractDniSignedView>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function parseStoredDniReference(
  raw: unknown,
  context: {
    readonly entryId: string;
    readonly collection: ContractRepeatableCollection;
    readonly definition: ContractDniUploadDefinition;
    readonly environment: NodeJS.ProcessEnv;
  },
): ContractDniImageReference | null {
  if (!isRecord(raw)) return null;

  const originalName = raw.originalName;
  const mimeType = raw.mimeType;
  const sizeBytes = raw.sizeBytes;
  const storagePath = raw.storagePath;
  const storageBucket = raw.storageBucket;
  const publicPath = raw.publicPath;
  const slot = raw.slot;
  if (
    typeof originalName !== 'string' ||
    originalName.trim() === '' ||
    typeof mimeType !== 'string' ||
    !CONTRACT_DNI_IMAGE_MIME_TYPES.has(mimeType) ||
    typeof sizeBytes !== 'number' ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > getContractDniMaxImageBytes(context.environment) ||
    typeof storagePath !== 'string' ||
    typeof storageBucket !== 'string' ||
    typeof publicPath !== 'string' ||
    slot !== context.definition.slot
  ) {
    return null;
  }

  const expectedBucket = getContractDniStorageBucket(context.environment);
  const expectedPath = new RegExp(
    `^contracts/${escapeRegExp(context.entryId)}/client/`
      + `${escapeRegExp(context.collection)}/\\d+/`
      + `${escapeRegExp(context.definition.slot)}-`
      + '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-'
      + '[89ab][0-9a-f]{3}-[0-9a-f]{12}-[^/]+$',
    'iu',
  );
  if (
    storageBucket !== expectedBucket ||
    !expectedPath.test(storagePath) ||
    publicPath !== `${storageBucket}/${storagePath}`
  ) {
    return null;
  }

  return {
    originalName,
    mimeType,
    sizeBytes,
    storagePath,
    storageBucket,
    publicPath,
    slot: context.definition.slot,
  };
}

function inspectField(
  field: ContractFieldDefinition,
  values: Readonly<Record<string, unknown>>,
): ContractAdminInspectionField {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    value: Object.prototype.hasOwnProperty.call(values, field.name)
      ? values[field.name]
      : null,
  };
}

function groupedFieldNames(section: ContractRoleSectionDefinition): ReadonlySet<string> {
  return new Set(
    section.subsections?.flatMap((subsection) => subsection.fieldNames) ?? [],
  );
}

function inspectUngroupedFields(
  section: ContractRoleSectionDefinition,
  values: Readonly<Record<string, unknown>>,
): readonly ContractAdminInspectionField[] {
  const groupedNames = groupedFieldNames(section);
  return section.fields
    .filter((field) => !groupedNames.has(field.name))
    .map((field) => inspectField(field, values));
}

function inspectSubsections(
  section: ContractRoleSectionDefinition,
  values: Readonly<Record<string, unknown>>,
): readonly ContractAdminInspectionSubsection[] {
  const fieldsByName = new Map(section.fields.map((field) => [field.name, field]));
  return (section.subsections ?? []).map((subsection) => ({
    title: subsection.title,
    fields: subsection.fieldNames.flatMap((fieldName) => {
      const field = fieldsByName.get(fieldName);
      return field ? [inspectField(field, values)] : [];
    }),
  }));
}

async function inspectMedia(
  section: ContractRoleSectionDefinition,
  values: Readonly<Record<string, unknown>>,
  entry: ContractEntryRecord,
  environment: NodeJS.ProcessEnv,
  dependencies: ContractAdminInspectionDependencies,
): Promise<readonly ContractAdminInspectionMedia[]> {
  const repeatable = section.repeatable;
  if (!repeatable) return [];

  const media: ContractAdminInspectionMedia[] = [];
  for (const definition of section.uploads ?? []) {
    const reference = parseStoredDniReference(values[definition.name], {
      entryId: entry.id,
      collection: repeatable.name,
      definition,
      environment,
    });
    if (!reference) continue;

    const signed = await dependencies.issueDniViewUrl(reference, environment);
    media.push({
      fieldName: definition.name,
      label: definition.label,
      slot: definition.slot,
      originalName: reference.originalName,
      mimeType: reference.mimeType,
      sizeBytes: reference.sizeBytes,
      viewUrl: signed.viewUrl,
      expiresAt: signed.expiresAt,
    });
  }
  return media;
}

async function inspectItem(
  section: ContractRoleSectionDefinition,
  rawItem: unknown,
  index: number,
  entry: ContractEntryRecord,
  environment: NodeJS.ProcessEnv,
  dependencies: ContractAdminInspectionDependencies,
): Promise<ContractAdminInspectionItem> {
  const values = isRecord(rawItem) ? rawItem : {};
  return {
    index,
    label: `${section.repeatable?.itemLabel ?? section.title} ${index + 1}`,
    fields: inspectUngroupedFields(section, values),
    subsections: inspectSubsections(section, values),
    media: await inspectMedia(section, values, entry, environment, dependencies),
  };
}

async function inspectSection(
  section: ContractRoleSectionDefinition,
  submission: Readonly<Record<string, unknown>>,
  entry: ContractEntryRecord,
  environment: NodeJS.ProcessEnv,
  dependencies: ContractAdminInspectionDependencies,
): Promise<ContractAdminInspectionSection> {
  if (!section.repeatable) {
    return {
      title: section.title,
      fields: inspectUngroupedFields(section, submission),
      subsections: inspectSubsections(section, submission),
      items: [],
    };
  }

  const rawItems = submission[section.repeatable.name];
  const items: ContractAdminInspectionItem[] = [];
  if (Array.isArray(rawItems)) {
    for (const [index, rawItem] of rawItems.entries()) {
      items.push(await inspectItem(
        section,
        rawItem,
        index,
        entry,
        environment,
        dependencies,
      ));
    }
  }
  return {
    title: section.title,
    fields: [],
    subsections: [],
    items,
  };
}

export function getContractSubmissionRecordsByRole(
  entryId: string,
  submissions: readonly ContractSubmissionRecord[],
): ReadonlyMap<ContractRole, ContractSubmissionRecord> {
  const byRole = new Map<ContractRole, ContractSubmissionRecord>();
  for (const submission of submissions) {
    if (submission.entryId !== entryId || byRole.has(submission.role)) continue;
    byRole.set(submission.role, submission);
  }
  return byRole;
}

async function inspectSubmission(
  entry: ContractEntryRecord,
  submission: ContractSubmissionRecord,
  environment: NodeJS.ProcessEnv,
  dependencies: ContractAdminInspectionDependencies,
): Promise<ContractAdminInspectionSubmission> {
  const roleSchema = getContractRoleSchema(entry.schemaId, submission.role);
  const sections: ContractAdminInspectionSection[] = [];
  for (const section of roleSchema.sections) {
    sections.push(await inspectSection(
      section,
      submission.submission,
      entry,
      environment,
      dependencies,
    ));
  }
  return {
    submissionId: submission.id,
    role: submission.role,
    submittedAt: submission.submittedAt,
    sections,
  };
}

export async function buildContractAdminInspection(
  entry: ContractEntryRecord,
  submissions: readonly ContractSubmissionRecord[],
  environment: NodeJS.ProcessEnv = process.env,
  dependencyOverrides: Partial<ContractAdminInspectionDependencies> = {},
): Promise<ContractAdminInspection> {
  const dependencies: ContractAdminInspectionDependencies = {
    issueDniViewUrl: dependencyOverrides.issueDniViewUrl ?? issueContractDniViewUrl,
  };
  const submissionsByRole = getContractSubmissionRecordsByRole(entry.id, submissions);
  const inspectedSubmissions: ContractAdminInspectionSubmission[] = [];
  for (const role of INSPECTION_ROLE_ORDER) {
    const submission = submissionsByRole.get(role);
    if (!submission) continue;
    inspectedSubmissions.push(await inspectSubmission(
      entry,
      submission,
      environment,
      dependencies,
    ));
  }
  return {
    hasSubmissions: inspectedSubmissions.length > 0,
    submissions: inspectedSubmissions,
  };
}
