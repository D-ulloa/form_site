import { getContractRoleSchema } from '../config/contractSchemas.js';
import type {
  ContractAdminInspection,
  ContractAdminInspectionEvidenceMedia,
  ContractAdminInspectionField,
  ContractAdminInspectionItem,
  ContractAdminInspectionMedia,
  ContractAdminInspectionSection,
  ContractAdminInspectionSubsection,
  ContractAdminInspectionSubmission,
  ContractDniImageReference,
  ContractDniUploadDefinition,
  ContractEntryRecord,
  ContractEvidenceFileReference,
  ContractFieldDefinition,
  ContractFileReceiverDefinition,
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
import {
  CONTRACT_EVIDENCE_FILE_MIME_TYPE_SET,
  getContractEvidenceMaxFileBytes,
  getContractEvidenceStorageBucket,
  isContractEvidenceStoragePath,
  issueContractEvidenceViewUrl,
  type ContractEvidenceSignedView,
} from './contractEvidenceUploadService.js';

const INSPECTION_ROLE_ORDER = ['user', 'client'] as const satisfies readonly ContractRole[];

export interface ContractAdminInspectionDependencies {
  readonly issueDniViewUrl: (
    reference: ContractDniImageReference,
    environment: NodeJS.ProcessEnv,
  ) => Promise<ContractDniSignedView>;
  readonly issueEvidenceViewUrl: (
    reference: ContractEvidenceFileReference,
    environment: NodeJS.ProcessEnv,
  ) => Promise<ContractEvidenceSignedView>;
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

function parseStoredEvidenceReference(
  raw: unknown,
  context: {
    readonly entryId: string;
    readonly itemIndex: number;
    readonly definition: ContractFileReceiverDefinition;
    readonly environment: NodeJS.ProcessEnv;
  },
): ContractEvidenceFileReference | null {
  if (!isRecord(raw)) return null;

  const filename = raw.filename;
  const mimeType = raw.mimeType;
  const size = raw.size;
  const storagePath = raw.storagePath;
  const storageBucket = raw.storageBucket;
  if (
    typeof filename !== 'string' ||
    filename.trim() === '' ||
    typeof mimeType !== 'string' ||
    !CONTRACT_EVIDENCE_FILE_MIME_TYPE_SET.has(mimeType) ||
    !context.definition.acceptedMimeTypes.includes(mimeType) ||
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > getContractEvidenceMaxFileBytes(context.environment) ||
    size > context.definition.maxSizeBytes ||
    typeof storagePath !== 'string' ||
    typeof storageBucket !== 'string'
  ) {
    return null;
  }

  const expectedBucket = getContractEvidenceStorageBucket(context.environment);
  if (
    storageBucket !== expectedBucket ||
    !isContractEvidenceStoragePath({
      entryId: context.entryId,
      itemIndex: context.itemIndex,
      field: context.definition.name,
      filename,
      storagePath,
    })
  ) {
    return null;
  }

  return {
    filename,
    mimeType,
    size,
    storagePath,
    storageBucket,
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

async function inspectSubsectionEvidence(
  receiver: ContractFileReceiverDefinition,
  values: Readonly<Record<string, unknown>>,
  entry: ContractEntryRecord,
  itemIndex: number | null,
  environment: NodeJS.ProcessEnv,
  dependencies: ContractAdminInspectionDependencies,
): Promise<readonly ContractAdminInspectionEvidenceMedia[]> {
  if (itemIndex === null) return [];
  const rawFiles = values[receiver.name];
  if (!Array.isArray(rawFiles) || rawFiles.length > receiver.maxFiles) return [];

  const media: ContractAdminInspectionEvidenceMedia[] = [];
  for (const rawFile of rawFiles) {
    const reference = parseStoredEvidenceReference(rawFile, {
      entryId: entry.id,
      itemIndex,
      definition: receiver,
      environment,
    });
    if (!reference) continue;
    const signed = await dependencies.issueEvidenceViewUrl(reference, environment);
    media.push({
      fieldName: receiver.name,
      label: receiver.label,
      filename: reference.filename,
      mimeType: reference.mimeType,
      size: reference.size,
      viewUrl: signed.viewUrl,
      expiresAt: signed.expiresAt,
    });
  }
  return media;
}

async function inspectSubsections(
  section: ContractRoleSectionDefinition,
  values: Readonly<Record<string, unknown>>,
  entry: ContractEntryRecord,
  itemIndex: number | null,
  environment: NodeJS.ProcessEnv,
  dependencies: ContractAdminInspectionDependencies,
): Promise<readonly ContractAdminInspectionSubsection[]> {
  const fieldsByName = new Map(section.fields.map((field) => [field.name, field]));
  const subsections: ContractAdminInspectionSubsection[] = [];
  for (const subsection of section.subsections ?? []) {
    const media: ContractAdminInspectionEvidenceMedia[] = [];
    for (const receiver of subsection.fileReceivers ?? []) {
      media.push(...await inspectSubsectionEvidence(
        receiver,
        values,
        entry,
        itemIndex,
        environment,
        dependencies,
      ));
    }
    subsections.push({
      title: subsection.title,
      fields: subsection.fieldNames.flatMap((fieldName) => {
        const field = fieldsByName.get(fieldName);
        return field ? [inspectField(field, values)] : [];
      }),
      media,
    });
  }
  return subsections;
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
    subsections: await inspectSubsections(
      section,
      values,
      entry,
      index,
      environment,
      dependencies,
    ),
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
      subsections: await inspectSubsections(
        section,
        submission,
        entry,
        null,
        environment,
        dependencies,
      ),
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
    if (submission.entryId !== entryId) continue;
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
  const roleSchema = getContractRoleSchema(
    entry.schemaId,
    submission.role,
    environment,
  );
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

export async function hydrateContractRoleValuesWithDownloadUrls(
  entry: ContractEntryRecord,
  role: ContractRole,
  sections: readonly ContractRoleSectionDefinition[],
  values: Readonly<Record<string, unknown>>,
  environment: NodeJS.ProcessEnv,
  dependencyOverrides: Partial<ContractAdminInspectionDependencies> = {},
): Promise<Readonly<Record<string, unknown>>> {
  if (role !== "client") return values;
  const dependencies: ContractAdminInspectionDependencies = {
    issueDniViewUrl: dependencyOverrides.issueDniViewUrl ?? issueContractDniViewUrl,
    issueEvidenceViewUrl: dependencyOverrides.issueEvidenceViewUrl ?? issueContractEvidenceViewUrl,
  };
  const nextValues: Record<string, unknown> = { ...values };

  for (const section of sections) {
    if (!section.repeatable) continue;
    const rawItems = values[section.repeatable.name];
    if (!Array.isArray(rawItems)) continue;
    const nextItems = [...rawItems];

    for (const [itemIndex, rawItem] of rawItems.entries()) {
      if (!isRecord(rawItem)) continue;
      const nextItem: Record<string, unknown> = { ...rawItem };
      for (const definition of section.uploads ?? []) {
        const reference = parseStoredDniReference(rawItem[definition.name], {
          entryId: entry.id,
          collection: section.repeatable.name,
          definition,
          environment,
        });
        if (!reference) continue;
        const signed = await dependencies.issueDniViewUrl(reference, environment);
        nextItem[definition.name] = {
          ...reference,
          viewUrl: signed.viewUrl,
          downloadUrl: signed.viewUrl,
          expiresAt: signed.expiresAt,
        };
      }
      for (const subsection of section.subsections ?? []) {
        for (const receiver of subsection.fileReceivers ?? []) {
          const rawFiles = rawItem[receiver.name];
          if (!Array.isArray(rawFiles)) continue;
          const nextFiles: unknown[] = [];
          for (const rawFile of rawFiles) {
            const reference = parseStoredEvidenceReference(rawFile, {
              entryId: entry.id,
              itemIndex,
              definition: receiver,
              environment,
            });
            if (!reference) {
              nextFiles.push(rawFile);
              continue;
            }
            const signed = await dependencies.issueEvidenceViewUrl(reference, environment);
            nextFiles.push({
              ...reference,
              viewUrl: signed.viewUrl,
              downloadUrl: signed.viewUrl,
              expiresAt: signed.expiresAt,
            });
          }
          nextItem[receiver.name] = nextFiles;
        }
      }
      nextItems[itemIndex] = nextItem;
    }
    nextValues[section.repeatable.name] = nextItems;
  }

  return nextValues;
}

export async function buildContractAdminInspection(
  entry: ContractEntryRecord,
  submissions: readonly ContractSubmissionRecord[],
  environment: NodeJS.ProcessEnv = process.env,
  dependencyOverrides: Partial<ContractAdminInspectionDependencies> = {},
): Promise<ContractAdminInspection> {
  const dependencies: ContractAdminInspectionDependencies = {
    issueDniViewUrl: dependencyOverrides.issueDniViewUrl ?? issueContractDniViewUrl,
    issueEvidenceViewUrl:
      dependencyOverrides.issueEvidenceViewUrl ?? issueContractEvidenceViewUrl,
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
