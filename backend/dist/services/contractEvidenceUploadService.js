import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
const DEFAULT_BUCKET = 'contract-evidence';
const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const CONTRACT_EVIDENCE_VIEW_TTL_SECONDS = 10 * 60;
const CONTRACT_EVIDENCE_VERIFICATION_CONCURRENCY = 4;
export const CONTRACT_EVIDENCE_FILE_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
];
export const CONTRACT_EVIDENCE_FILE_MIME_TYPE_SET = new Set(CONTRACT_EVIDENCE_FILE_MIME_TYPES);
export class ContractEvidenceUploadConfigurationError extends Error {
    constructor() {
        super('Contract evidence uploads require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
        this.name = 'ContractEvidenceUploadConfigurationError';
    }
}
export class ContractEvidenceUploadValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ContractEvidenceUploadValidationError';
    }
}
export class ContractEvidenceVerificationUnavailableError extends Error {
    constructor() {
        super('Contract evidence storage could not be verified. Try again later.');
        this.name = 'ContractEvidenceVerificationUnavailableError';
    }
}
export function getContractEvidenceStorageBucket(environment = process.env) {
    return environment.CONTRACT_EVIDENCE_STORAGE_BUCKET?.trim() || DEFAULT_BUCKET;
}
export function getContractEvidenceMaxFileBytes(environment = process.env) {
    const configured = Number(environment.CONTRACT_EVIDENCE_MAX_FILE_BYTES);
    return Number.isSafeInteger(configured) && configured > 0
        ? configured
        : DEFAULT_MAX_FILE_BYTES;
}
function createSupabaseClient(environment) {
    const url = environment.SUPABASE_URL?.trim();
    const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceRoleKey)
        throw new ContractEvidenceUploadConfigurationError();
    return createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
export function sanitizeContractEvidenceFileName(rawName) {
    const filename = path.basename(rawName)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/gu, '')
        .replace(/[^a-zA-Z0-9._-]/gu, '_')
        .slice(0, 120);
    return filename || 'evidence-file';
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
export function isContractEvidenceStoragePath(input) {
    if (!Number.isSafeInteger(input.itemIndex) || input.itemIndex < 0)
        return false;
    const expectedPath = new RegExp(`^contracts/${escapeRegExp(input.entryId)}/client/garantes/${input.itemIndex}/`
        + `${escapeRegExp(input.field)}/`
        + '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-'
        + '[89ab][0-9a-f]{3}-[0-9a-f]{12}-'
        + `${escapeRegExp(sanitizeContractEvidenceFileName(input.filename))}$`, 'u');
    return expectedPath.test(input.storagePath);
}
function validateDescriptor(descriptor, environment) {
    if (!Number.isSafeInteger(descriptor.itemIndex) || descriptor.itemIndex < 0) {
        throw new ContractEvidenceUploadValidationError('Evidence upload itemIndex must be a non-negative integer.');
    }
    if (!descriptor.filename.trim() || descriptor.filename.length > 256) {
        throw new ContractEvidenceUploadValidationError('Evidence upload filename is required.');
    }
    if (!CONTRACT_EVIDENCE_FILE_MIME_TYPE_SET.has(descriptor.mimeType)) {
        throw new ContractEvidenceUploadValidationError('Evidence uploads accept PDF, JPG, PNG, GIF, WEBP, BMP, or TIFF files only.');
    }
    if (!Number.isSafeInteger(descriptor.size) ||
        descriptor.size <= 0 ||
        descriptor.size > getContractEvidenceMaxFileBytes(environment)) {
        throw new ContractEvidenceUploadValidationError('The evidence file size is outside the configured limit.');
    }
}
export async function issueContractEvidenceUploadUrls(entryId, descriptors, environment = process.env, clientOverride) {
    const bucket = getContractEvidenceStorageBucket(environment);
    const client = clientOverride ?? createSupabaseClient(environment);
    const results = [];
    for (const descriptor of descriptors) {
        validateDescriptor(descriptor, environment);
        const storagePath = [
            'contracts',
            entryId,
            'client',
            descriptor.collection,
            String(descriptor.itemIndex),
            descriptor.field,
            `${randomUUID()}-${sanitizeContractEvidenceFileName(descriptor.filename)}`,
        ].join('/');
        const { data, error } = await client.storage
            .from(bucket)
            .createSignedUploadUrl(storagePath, { upsert: false });
        if (error || !data?.signedUrl || !data.path) {
            throw new Error(error?.message ?? 'Unable to create a signed evidence upload URL.');
        }
        results.push({
            filename: descriptor.filename,
            mimeType: descriptor.mimeType,
            size: descriptor.size,
            storagePath: data.path,
            storageBucket: bucket,
            uploadUrl: data.signedUrl,
        });
    }
    return results;
}
function evidenceVerificationIssue(target, message) {
    return {
        path: target.path,
        code: 'invalid_type',
        message,
    };
}
export async function verifyContractEvidenceReferences(targets, environment = process.env, clientOverride) {
    if (targets.length === 0)
        return [];
    const expectedBucket = getContractEvidenceStorageBucket(environment);
    const client = clientOverride ?? createSupabaseClient(environment);
    const errorsByIndex = new Array(targets.length);
    const uniqueTargets = [];
    const storagePaths = new Set();
    targets.forEach((target, index) => {
        const storageKey = `${target.reference.storageBucket}\u0000${target.reference.storagePath}`;
        if (storagePaths.has(storageKey)) {
            errorsByIndex[index] = [evidenceVerificationIssue(target, `${target.reference.filename} está repetido en la misma presentación.`)];
            return;
        }
        storagePaths.add(storageKey);
        uniqueTargets.push({ index, target });
    });
    for (let start = 0; start < uniqueTargets.length; start += CONTRACT_EVIDENCE_VERIFICATION_CONCURRENCY) {
        const batch = uniqueTargets.slice(start, start + CONTRACT_EVIDENCE_VERIFICATION_CONCURRENCY);
        await Promise.all(batch.map(async ({ index, target }) => {
            const reference = target.reference;
            if (reference.storageBucket !== expectedBucket) {
                errorsByIndex[index] = [evidenceVerificationIssue(target, `${reference.filename} no pertenece al almacenamiento privado configurado.`)];
                return;
            }
            let result;
            try {
                result = await client.storage
                    .from(reference.storageBucket)
                    .info(reference.storagePath);
            }
            catch {
                throw new ContractEvidenceVerificationUnavailableError();
            }
            const { data, error } = result;
            if (error) {
                if (error.status === 400 || error.status === 404) {
                    errorsByIndex[index] = [evidenceVerificationIssue(target, `${reference.filename} no se encontró en el almacenamiento privado. Volvé a subirlo.`)];
                    return;
                }
                throw new ContractEvidenceVerificationUnavailableError();
            }
            if (!data) {
                throw new ContractEvidenceVerificationUnavailableError();
            }
            const storedSize = data.size ?? data.metadata?.size;
            const storedMimeType = data.contentType ?? data.metadata?.mimetype;
            if (!Number.isSafeInteger(storedSize) || typeof storedMimeType !== 'string') {
                throw new ContractEvidenceVerificationUnavailableError();
            }
            if (storedSize !== reference.size || storedMimeType !== reference.mimeType) {
                errorsByIndex[index] = [evidenceVerificationIssue(target, `${reference.filename} no coincide con el archivo cargado. Volvé a subirlo.`)];
            }
        }));
    }
    return errorsByIndex.flatMap((errors) => errors ?? []);
}
export async function issueContractEvidenceViewUrl(reference, environment = process.env, clientOverride, now = () => new Date()) {
    const expectedBucket = getContractEvidenceStorageBucket(environment);
    if (reference.storageBucket !== expectedBucket ||
        !reference.storagePath.startsWith('contracts/')) {
        throw new ContractEvidenceUploadValidationError('The stored evidence reference is not valid for private viewing.');
    }
    const client = clientOverride ?? createSupabaseClient(environment);
    const { data, error } = await client.storage
        .from(reference.storageBucket)
        .createSignedUrl(reference.storagePath, CONTRACT_EVIDENCE_VIEW_TTL_SECONDS);
    if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? 'Unable to create a signed evidence view URL.');
    }
    return {
        viewUrl: data.signedUrl,
        expiresAt: new Date(now().getTime() + (CONTRACT_EVIDENCE_VIEW_TTL_SECONDS * 1000)).toISOString(),
    };
}
//# sourceMappingURL=contractEvidenceUploadService.js.map