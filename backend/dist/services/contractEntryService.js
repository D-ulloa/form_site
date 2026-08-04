import { randomUUID } from 'node:crypto';
import { getContractRoleSchema, getContractSchemaDefinition } from '../config/contractSchemas.js';
import { verifyContractEvidenceReferences, } from './contractEvidenceUploadService.js';
import { validateContractRoleSubmissionFields } from './validateContractRoleSubmission.js';
import { generateContractAccessToken, hashContractAccessToken, } from './contractTokenService.js';
export class ContractRoleValidationError extends Error {
    errors;
    constructor(errors) {
        super('Contract role submission validation failed.');
        this.name = 'ContractRoleValidationError';
        this.errors = errors;
    }
}
export class ContractPublicBaseUrlConfigurationError extends Error {
    constructor() {
        super('CONTRACT_PUBLIC_BASE_URL must be an absolute HTTP or HTTPS frontend URL.');
        this.name = 'ContractPublicBaseUrlConfigurationError';
    }
}
function normalizeBaseUrl(baseUrl) {
    try {
        const url = new URL(baseUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new ContractPublicBaseUrlConfigurationError();
        }
        return url.toString().replace(/\/$/u, '');
    }
    catch (error) {
        if (error instanceof ContractPublicBaseUrlConfigurationError)
            throw error;
        throw new ContractPublicBaseUrlConfigurationError();
    }
}
function buildRoleUrl(baseUrl, entryId, role, token) {
    const url = new URL(`/contracts/${encodeURIComponent(entryId)}/${role}`, `${baseUrl}/`);
    url.searchParams.set('token', token);
    return url.toString();
}
function buildAdminUrl(baseUrl, entryId) {
    return new URL(`/contracts/admin/${encodeURIComponent(entryId)}`, `${baseUrl}/`).toString();
}
export function toContractEntrySummary(entry) {
    return {
        entryId: entry.id,
        schemaId: entry.schemaId,
        direccion: entry.direccion ?? null,
        createdBy: entry.createdBy,
        createdAt: entry.createdAt,
        userFilled: entry.userFilled,
        clientFilled: entry.clientFilled,
        userSubmittedAt: entry.userSubmittedAt,
        clientSubmittedAt: entry.clientSubmittedAt,
        status: entry.status,
        archivedAt: entry.archivedAt,
    };
}
export async function createContractEntry(input, repository, environment = process.env, dependencies = {}) {
    getContractSchemaDefinition(input.schemaId);
    const now = dependencies.now ?? (() => new Date());
    const generateId = dependencies.generateId ?? randomUUID;
    const generateToken = dependencies.generateToken ?? generateContractAccessToken;
    const createdAt = now().toISOString();
    const entryId = generateId();
    const userToken = generateToken();
    const clientToken = generateToken();
    const direccion = input.direccion?.trim() || 'Sin dirección';
    await repository.createEntry({
        id: entryId,
        schemaId: input.schemaId,
        direccion,
        createdBy: input.createdBy,
        createdAt,
        userTokenHash: hashContractAccessToken(userToken, environment),
        clientTokenHash: hashContractAccessToken(clientToken, environment),
    });
    const baseUrl = normalizeBaseUrl(input.publicBaseUrl);
    return {
        entryId,
        direccion,
        adminUrl: buildAdminUrl(baseUrl, entryId),
        userUrl: buildRoleUrl(baseUrl, entryId, 'user', userToken),
        clientUrl: buildRoleUrl(baseUrl, entryId, 'client', clientToken),
        createdAt,
        status: 'open',
    };
}
function sanitizeValue(value) {
    if (typeof value === 'string') {
        return value.replace(/[\u0000\u000B\u000C\u000E-\u001F\u007F]/gu, '');
    }
    if (Array.isArray(value))
        return value.map(sanitizeValue);
    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(Object.entries(value).map(([name, nestedValue]) => [name, sanitizeValue(nestedValue)]));
    }
    return value;
}
function sanitizeFields(fields) {
    return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, sanitizeValue(value)]));
}
const CONTRACT_EVIDENCE_FIELDS = [
    'recibo_sueldo_files',
    'garantia_propietaria_files',
];
function collectContractEvidenceReferences(fields) {
    const guarantors = fields.garantes;
    if (!Array.isArray(guarantors))
        return [];
    const targets = [];
    guarantors.forEach((rawGuarantor, itemIndex) => {
        if (typeof rawGuarantor !== 'object' || rawGuarantor === null)
            return;
        const guarantor = rawGuarantor;
        for (const field of CONTRACT_EVIDENCE_FIELDS) {
            const rawReferences = guarantor[field];
            if (!Array.isArray(rawReferences))
                continue;
            rawReferences.forEach((rawReference, fileIndex) => {
                targets.push({
                    path: `fields.garantes.${itemIndex}.${field}.${fileIndex}`,
                    reference: rawReference,
                });
            });
        }
    });
    return targets;
}
export async function submitContractEntryRole(input, repository, dependencies = {}) {
    const environment = dependencies.environment ?? process.env;
    const roleSchema = getContractRoleSchema(input.entry.schemaId, input.role, environment);
    const validation = validateContractRoleSubmissionFields({
        entry: input.entry,
        role: input.role,
        roleSchema,
        fields: input.fields,
    }, environment);
    if (!validation.success)
        throw new ContractRoleValidationError(validation.errors);
    if (input.role === 'client') {
        const evidenceErrors = await (dependencies.verifyEvidenceReferences ?? verifyContractEvidenceReferences)(collectContractEvidenceReferences(validation.fields), environment);
        if (evidenceErrors.length > 0)
            throw new ContractRoleValidationError(evidenceErrors);
    }
    const submissionId = (dependencies.generateSubmissionId ?? randomUUID)();
    const submissionInput = {
        entryId: input.entry.id,
        authorizedTokenHash: input.authorizedTokenHash,
        role: input.role,
        fields: sanitizeFields(validation.fields),
        metadata: input.metadata,
        submittedAt: input.metadata.receivedAt,
        submissionId,
    };
    const entry = input.mode === "update" && repository.updateRoleSubmission
        ? await repository.updateRoleSubmission(submissionInput)
        : await repository.saveRoleSubmission(submissionInput);
    return {
        submissionId,
        entryId: entry.id,
        status: entry.status === 'complete' ? 'complete' : 'open',
        submittedAt: input.metadata.receivedAt,
    };
}
export async function regenerateContractRoleToken(input, repository, environment = process.env, dependencies = {}) {
    const token = (dependencies.generateToken ?? generateContractAccessToken)();
    const occurredAt = (dependencies.now ?? (() => new Date()))().toISOString();
    await repository.replaceTokenHash(input.entryId, input.role, hashContractAccessToken(token, environment), occurredAt);
    return {
        role: input.role,
        url: buildRoleUrl(normalizeBaseUrl(input.publicBaseUrl), input.entryId, input.role, token),
    };
}
//# sourceMappingURL=contractEntryService.js.map