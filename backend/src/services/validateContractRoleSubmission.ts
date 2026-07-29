import { z } from 'zod';
import type {
  ContractDniImageReference,
  ContractDniUploadDefinition,
  ContractEntryRecord,
  ContractRole,
  ContractRoleSectionDefinition,
  ContractRoleSchema,
  ContractValidationIssue,
} from '../contracts/types.js';
import {
  CONTRACT_DNI_IMAGE_MIME_TYPES,
  getContractDniMaxImageBytes,
  getContractDniStorageBucket,
} from './contractDniUploadService.js';
import { validateContractSubmissionAgainstSchema } from './validateContractSubmission.js';

const DniImageReferenceSchema = z.object({
  originalName: z.string().trim().min(1).max(256),
  mimeType: z.string().trim().min(1).max(128),
  sizeBytes: z.number().int().positive(),
  storagePath: z.string().trim().min(1).max(1024),
  storageBucket: z.string().trim().min(1).max(128),
  publicPath: z.string().trim().min(1).max(1200),
  slot: z.enum(['front', 'back']),
}).strict();

export type ContractRoleFieldsValidationResult =
  | {
      readonly success: true;
      readonly fields: Readonly<Record<string, unknown>>;
    }
  | {
      readonly success: false;
      readonly errors: readonly ContractValidationIssue[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(
  path: string,
  code: ContractValidationIssue['code'],
  message: string,
): ContractValidationIssue {
  return { path, code, message };
}

function hasMeaningfulValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function validateDniReference(
  raw: unknown,
  definition: ContractDniUploadDefinition,
  context: {
    readonly entryId: string;
    readonly collection: string;
    readonly path: string;
    readonly environment: NodeJS.ProcessEnv;
  },
): { readonly value?: ContractDniImageReference; readonly errors: readonly ContractValidationIssue[] } {
  const parsed = DniImageReferenceSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: [issue(
        context.path,
        'invalid_type',
        `${definition.label} must be a valid uploaded image reference.`,
      )],
    };
  }

  const value = parsed.data;
  const errors: ContractValidationIssue[] = [];
  const expectedBucket = getContractDniStorageBucket(context.environment);
  const escapedEntryId = context.entryId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const escapedCollection = context.collection.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const expectedPath = new RegExp(
    `^contracts/${escapedEntryId}/client/${escapedCollection}/\\d+/${definition.slot}-`
      + '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[^/]+$',
    'iu',
  );

  if (!CONTRACT_DNI_IMAGE_MIME_TYPES.has(value.mimeType)) {
    errors.push(issue(context.path, 'invalid_type', `${definition.label} must be an image file.`));
  }
  if (value.sizeBytes > getContractDniMaxImageBytes(context.environment)) {
    errors.push(issue(context.path, 'max', `${definition.label} exceeds the configured image limit.`));
  }
  if (value.slot !== definition.slot) {
    errors.push(issue(context.path, 'invalid_type', `${definition.label} has the wrong DNI side.`));
  }
  if (
    value.storageBucket !== expectedBucket ||
    !expectedPath.test(value.storagePath) ||
    value.publicPath !== `${value.storageBucket}/${value.storagePath}`
  ) {
    errors.push(issue(
      context.path,
      'invalid_type',
      `${definition.label} is not associated with this contract entry.`,
    ));
  }

  return errors.length > 0 ? { errors } : { value, errors: [] };
}

function sectionSchema(
  roleSchema: ContractRoleSchema,
  section: ContractRoleSectionDefinition,
) {
  return {
    schemaId: roleSchema.schemaId,
    contractType: roleSchema.contractType,
    sections: [{ title: section.title, fields: section.fields }],
    columnMap: Object.fromEntries(section.fields.map((field) => [field.name, field.label])),
  };
}

function validateRepeatedSection(
  raw: unknown,
  section: ContractRoleSectionDefinition,
  roleSchema: ContractRoleSchema,
  entry: ContractEntryRecord,
  environment: NodeJS.ProcessEnv,
): { readonly values: readonly Readonly<Record<string, unknown>>[]; readonly errors: readonly ContractValidationIssue[] } {
  const repeatable = section.repeatable;
  if (!repeatable) return { values: [], errors: [] };
  const collectionPath = `fields.${repeatable.name}`;
  if (!Array.isArray(raw)) {
    return {
      values: [],
      errors: [issue(collectionPath, 'invalid_type', `${section.title} must be an array.`)],
    };
  }
  if (raw.length < repeatable.minItems) {
    return {
      values: [],
      errors: [issue(collectionPath, 'required', `${section.title} requires at least one entry.`)],
    };
  }

  const values: Readonly<Record<string, unknown>>[] = [];
  const errors: ContractValidationIssue[] = [];
  const fieldNames = new Set(section.fields.map((field) => field.name));
  const uploadNames = new Set((section.uploads ?? []).map((upload) => upload.name));

  raw.forEach((item, index) => {
    const itemPath = `${collectionPath}.${index}`;
    if (!isRecord(item)) {
      errors.push(issue(itemPath, 'invalid_type', `${repeatable.itemLabel} must be an object.`));
      return;
    }

    const scalarFields = Object.fromEntries(
      Object.entries(item).filter(([name]) => fieldNames.has(name)),
    );
    const scalarValidation = validateContractSubmissionAgainstSchema({
      schemaId: roleSchema.schemaId,
      contractType: roleSchema.contractType,
      fields: scalarFields,
      meta: { userId: entry.createdBy, origin: 'ui' },
    }, sectionSchema(roleSchema, section));
    const validatedItem: Record<string, unknown> = {};
    if (scalarValidation.success) {
      Object.assign(validatedItem, scalarValidation.data.fields);
    } else {
      errors.push(...scalarValidation.errors.map((validationIssue) => ({
        ...validationIssue,
        path: `${itemPath}.${validationIssue.path.replace(/^fields\./u, '')}`,
      })));
    }

    let imageCount = 0;
    for (const upload of section.uploads ?? []) {
      const rawUpload = item[upload.name];
      if (rawUpload === undefined || rawUpload === null) {
        if (upload.required) {
          errors.push(issue(`${itemPath}.${upload.name}`, 'required', `${upload.label} is required.`));
        }
        continue;
      }
      imageCount += 1;
      const imageValidation = validateDniReference(rawUpload, upload, {
        entryId: entry.id,
        collection: repeatable.name,
        path: `${itemPath}.${upload.name}`,
        environment,
      });
      errors.push(...imageValidation.errors);
      if (imageValidation.value) validatedItem[upload.name] = imageValidation.value;
    }
    if (imageCount === 1 && (section.uploads?.length ?? 0) === 2) {
      errors.push(issue(
        itemPath,
        'required',
        `${repeatable.itemLabel} DNI images must include both Frente DNI and Dorso DNI.`,
      ));
    }
    if (imageCount > 2) {
      errors.push(issue(itemPath, 'max', `${repeatable.itemLabel} accepts at most two DNI images.`));
    }

    if (
      section.subsections?.length &&
      !section.subsections.some((subsection) =>
        subsection.fieldNames.some((fieldName) =>
          hasMeaningfulValue(validatedItem[fieldName])))
    ) {
      errors.push(issue(
        `${itemPath}._subsections`,
        'required',
        'Completá al menos Recibo de sueldo o Garantía propietaria.',
      ));
    }

    for (const fieldName of Object.keys(item)) {
      if (!fieldNames.has(fieldName) && !uploadNames.has(fieldName)) {
        errors.push(issue(
          `${itemPath}.${fieldName}`,
          'unknown_field',
          `Field "${fieldName}" is not defined for ${repeatable.itemLabel}.`,
        ));
      }
    }

    values.push(validatedItem);
  });

  return { values, errors };
}

export function validateContractRoleSubmissionFields(
  input: {
    readonly entry: ContractEntryRecord;
    readonly role: ContractRole;
    readonly roleSchema: ContractRoleSchema;
    readonly fields: Readonly<Record<string, unknown>>;
  },
  environment: NodeJS.ProcessEnv = process.env,
): ContractRoleFieldsValidationResult {
  if (input.role === 'user') {
    const validation = validateContractSubmissionAgainstSchema({
      schemaId: input.roleSchema.schemaId,
      contractType: input.roleSchema.contractType,
      fields: input.fields,
      meta: { userId: input.entry.createdBy, origin: 'ui' },
    }, {
      schemaId: input.roleSchema.schemaId,
      contractType: input.roleSchema.contractType,
      sections: input.roleSchema.sections,
      columnMap: Object.fromEntries(input.roleSchema.sections.flatMap((section) =>
        section.fields.map((field) => [field.name, field.label]))),
    });
    return validation.success
      ? { success: true, fields: validation.data.fields }
      : { success: false, errors: validation.errors };
  }

  const result: Record<string, unknown> = {};
  const errors: ContractValidationIssue[] = [];
  const expectedCollections = new Set<string>();
  for (const section of input.roleSchema.sections) {
    if (!section.repeatable) continue;
    expectedCollections.add(section.repeatable.name);
    const validation = validateRepeatedSection(
      input.fields[section.repeatable.name],
      section,
      input.roleSchema,
      input.entry,
      environment,
    );
    errors.push(...validation.errors);
    result[section.repeatable.name] = validation.values;
  }
  for (const fieldName of Object.keys(input.fields)) {
    if (!expectedCollections.has(fieldName)) {
      errors.push(issue(
        `fields.${fieldName}`,
        'unknown_field',
        `Field "${fieldName}" is not defined for the client role.`,
      ));
    }
  }

  return errors.length > 0
    ? { success: false, errors }
    : { success: true, fields: result };
}
