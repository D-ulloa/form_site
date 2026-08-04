import { z } from 'zod';
import { CONTRACT_DNI_IMAGE_MIME_TYPES, getContractDniMaxImageBytes, getContractDniStorageBucket, } from './contractDniUploadService.js';
import { CONTRACT_EVIDENCE_FILE_MIME_TYPE_SET, getContractEvidenceMaxFileBytes, getContractEvidenceStorageBucket, isContractEvidenceStoragePath, } from './contractEvidenceUploadService.js';
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
const EvidenceFileReferenceSchema = z.object({
    filename: z.string().trim().min(1).max(256),
    mimeType: z.string().trim().min(1).max(128),
    size: z.number().int().positive(),
    storagePath: z.string().trim().min(1).max(1024),
    storageBucket: z.string().trim().min(1).max(128),
}).strict();
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function issue(path, code, message) {
    return { path, code, message };
}
function hasMeaningfulValue(value) {
    if (typeof value === 'string')
        return value.trim().length > 0;
    return value !== undefined && value !== null;
}
function dniUploadsAreRequired(environment, entry) {
    // Migrated entries always have the SPEC-16 human identifier. Treat that as
    // the durable marker that the SPEC-17 policy is active; the explicit switch
    // also supports staged rollouts and production enforces it unconditionally.
    return environment.CONTRACT_DNI_UPLOADS_REQUIRED === 'true'
        || environment.NODE_ENV === 'production'
        || entry.direccion !== undefined && entry.direccion !== null;
}
function validateDniReference(raw, definition, context) {
    const parsed = DniImageReferenceSchema.safeParse(raw);
    if (!parsed.success) {
        return {
            errors: [issue(context.path, 'invalid_type', `${definition.label} must be a valid uploaded image reference.`)],
        };
    }
    const value = parsed.data;
    const errors = [];
    const expectedBucket = getContractDniStorageBucket(context.environment);
    const escapedEntryId = context.entryId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const escapedCollection = context.collection.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const expectedPath = new RegExp(`^contracts/${escapedEntryId}/client/${escapedCollection}/\\d+/${definition.slot}-`
        + '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[^/]+$', 'iu');
    if (!CONTRACT_DNI_IMAGE_MIME_TYPES.has(value.mimeType)) {
        errors.push(issue(context.path, 'invalid_type', `${definition.label} solo acepta JPG, PNG, WEBP, GIF, HEIC, HEIF o PDF.`));
    }
    if (value.sizeBytes > getContractDniMaxImageBytes(context.environment)) {
        errors.push(issue(context.path, 'max', `${definition.label} exceeds the configured image limit.`));
    }
    if (value.slot !== definition.slot) {
        errors.push(issue(context.path, 'invalid_type', `${definition.label} has the wrong DNI side.`));
    }
    if (value.storageBucket !== expectedBucket ||
        !expectedPath.test(value.storagePath) ||
        value.publicPath !== `${value.storageBucket}/${value.storagePath}`) {
        errors.push(issue(context.path, 'invalid_type', `${definition.label} is not associated with this contract entry.`));
    }
    return errors.length > 0 ? { errors } : { value, errors: [] };
}
function validateEvidenceReference(raw, definition, context) {
    const parsed = EvidenceFileReferenceSchema.safeParse(raw);
    if (!parsed.success) {
        return {
            errors: [issue(context.path, 'invalid_type', `${definition.label} debe contener una referencia de archivo válida.`)],
        };
    }
    const value = parsed.data;
    const errors = [];
    const expectedBucket = getContractEvidenceStorageBucket(context.environment);
    if (!CONTRACT_EVIDENCE_FILE_MIME_TYPE_SET.has(value.mimeType) ||
        !definition.acceptedMimeTypes.includes(value.mimeType)) {
        errors.push(issue(context.path, 'invalid_type', `${definition.label} solo acepta PDF, JPG, PNG, GIF, WEBP, BMP o TIFF.`));
    }
    if (value.size > definition.maxSizeBytes ||
        value.size > getContractEvidenceMaxFileBytes(context.environment)) {
        errors.push(issue(context.path, 'max', `${definition.label} supera el tamaño máximo permitido.`));
    }
    if (value.storageBucket !== expectedBucket ||
        !isContractEvidenceStoragePath({
            entryId: context.entryId,
            itemIndex: context.itemIndex,
            field: definition.name,
            filename: value.filename,
            storagePath: value.storagePath,
        })) {
        errors.push(issue(context.path, 'invalid_type', `${definition.label} no pertenece a esta entrada de contrato.`));
    }
    return errors.length > 0 ? { errors } : { value, errors: [] };
}
function sectionSchema(roleSchema, section) {
    return {
        schemaId: roleSchema.schemaId,
        contractType: roleSchema.contractType,
        sections: [{ title: section.title, fields: section.fields }],
        columnMap: Object.fromEntries(section.fields.map((field) => [field.name, field.label])),
    };
}
function validateRepeatedSection(raw, section, roleSchema, entry, environment) {
    const repeatable = section.repeatable;
    if (!repeatable)
        return { values: [], errors: [] };
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
    const values = [];
    const errors = [];
    const fieldNames = new Set(section.fields.map((field) => field.name));
    const uploadNames = new Set((section.uploads ?? []).map((upload) => upload.name));
    const fileReceiverNames = new Set(section.subsections?.flatMap((subsection) => subsection.fileReceivers?.map((receiver) => receiver.name) ?? []) ?? []);
    raw.forEach((item, index) => {
        const itemPath = `${collectionPath}.${index}`;
        if (!isRecord(item)) {
            errors.push(issue(itemPath, 'invalid_type', `${repeatable.itemLabel} must be an object.`));
            return;
        }
        const scalarFields = Object.fromEntries(Object.entries(item).filter(([name]) => fieldNames.has(name)));
        const scalarValidation = validateContractSubmissionAgainstSchema({
            schemaId: roleSchema.schemaId,
            contractType: roleSchema.contractType,
            fields: scalarFields,
            meta: { userId: entry.createdBy, origin: 'ui' },
        }, sectionSchema(roleSchema, section));
        const validatedItem = {};
        if (scalarValidation.success) {
            Object.assign(validatedItem, scalarValidation.data.fields);
        }
        else {
            errors.push(...scalarValidation.errors.map((validationIssue) => ({
                ...validationIssue,
                path: `${itemPath}.${validationIssue.path.replace(/^fields\./u, '')}`,
            })));
        }
        let imageCount = 0;
        for (const upload of section.uploads ?? []) {
            const rawUpload = item[upload.name];
            if (rawUpload === undefined || rawUpload === null) {
                if (upload.required && dniUploadsAreRequired(environment, entry)) {
                    errors.push(issue(`${itemPath}.${upload.name}`, 'required', upload.slot === 'front'
                        ? 'Se requiere la imagen frontal del DNI.'
                        : 'Se requiere la imagen del dorso del DNI.'));
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
            if (imageValidation.value)
                validatedItem[upload.name] = imageValidation.value;
        }
        if (imageCount === 1 && (section.uploads?.length ?? 0) === 2) {
            errors.push(issue(itemPath, 'required', `${repeatable.itemLabel} DNI images must include both Frente DNI and Dorso DNI.`));
        }
        if (imageCount > 2) {
            errors.push(issue(itemPath, 'max', `${repeatable.itemLabel} accepts at most two DNI images.`));
        }
        let evidenceFileCount = 0;
        for (const subsection of section.subsections ?? []) {
            for (const receiver of subsection.fileReceivers ?? []) {
                const receiverPath = `${itemPath}.${receiver.name}`;
                const rawFiles = item[receiver.name];
                if (rawFiles === undefined || rawFiles === null) {
                    validatedItem[receiver.name] = [];
                    continue;
                }
                if (!Array.isArray(rawFiles)) {
                    errors.push(issue(receiverPath, 'invalid_type', `${receiver.label} debe ser una lista de archivos.`));
                    validatedItem[receiver.name] = [];
                    continue;
                }
                if (rawFiles.length > receiver.maxFiles) {
                    errors.push(issue(receiverPath, 'max', `${receiver.label} acepta hasta ${receiver.maxFiles} archivos.`));
                }
                const validatedFiles = [];
                rawFiles.forEach((rawFile, fileIndex) => {
                    const fileValidation = validateEvidenceReference(rawFile, receiver, {
                        entryId: entry.id,
                        itemIndex: index,
                        path: `${receiverPath}.${fileIndex}`,
                        environment,
                    });
                    errors.push(...fileValidation.errors);
                    if (fileValidation.value)
                        validatedFiles.push(fileValidation.value);
                });
                evidenceFileCount += validatedFiles.length;
                validatedItem[receiver.name] = validatedFiles;
            }
        }
        if (fileReceiverNames.size > 0 && evidenceFileCount === 0) {
            errors.push(issue(`${itemPath}._files`, 'required', 'Subí al menos un archivo entre Recibo de sueldo y Garantía propietaria.'));
        }
        if (section.subsections?.length &&
            !section.subsections.some((subsection) => subsection.fieldNames.some((fieldName) => hasMeaningfulValue(validatedItem[fieldName])))) {
            errors.push(issue(`${itemPath}._subsections`, 'required', 'Completá al menos Recibo de sueldo o Garantía propietaria.'));
        }
        for (const fieldName of Object.keys(item)) {
            if (!fieldNames.has(fieldName) &&
                !uploadNames.has(fieldName) &&
                !fileReceiverNames.has(fieldName)) {
                errors.push(issue(`${itemPath}.${fieldName}`, 'unknown_field', `Field "${fieldName}" is not defined for ${repeatable.itemLabel}.`));
            }
        }
        values.push(validatedItem);
    });
    return { values, errors };
}
export function validateContractRoleSubmissionFields(input, environment = process.env) {
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
            columnMap: Object.fromEntries(input.roleSchema.sections.flatMap((section) => section.fields.map((field) => [field.name, field.label]))),
        });
        return validation.success
            ? { success: true, fields: validation.data.fields }
            : { success: false, errors: validation.errors };
    }
    const result = {};
    const errors = [];
    const expectedCollections = new Set();
    for (const section of input.roleSchema.sections) {
        if (!section.repeatable)
            continue;
        expectedCollections.add(section.repeatable.name);
        const validation = validateRepeatedSection(input.fields[section.repeatable.name], section, input.roleSchema, input.entry, environment);
        errors.push(...validation.errors);
        result[section.repeatable.name] = validation.values;
    }
    for (const fieldName of Object.keys(input.fields)) {
        if (!expectedCollections.has(fieldName)) {
            errors.push(issue(`fields.${fieldName}`, 'unknown_field', `Field "${fieldName}" is not defined for the client role.`));
        }
    }
    return errors.length > 0
        ? { success: false, errors }
        : { success: true, fields: result };
}
//# sourceMappingURL=validateContractRoleSubmission.js.map