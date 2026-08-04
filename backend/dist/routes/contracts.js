import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { ContractConfigurationError, ContractSchemaNotFoundError, getContractSchemaConfig, getPublicContractSchema, } from '../config/contractSchemas.js';
import { ContractMappingError } from '../mappers/contractSheetRowMapper.js';
import { ContractAuditIntegrityError, ContractAuditNotFoundError, InvalidContractSubmissionIdError, readContractAuditLog, } from '../services/contractAuditLogger.js';
import { ContractAuthenticationError, ContractAuthorizationError, authenticateContractRequest, authorizeContractUserScope, } from '../services/contractAuth.js';
import { ContractAuditPersistenceError, createContractSubmission, } from '../services/createContractSubmission.js';
import { ContractSheetMappingConfigurationError } from '../services/contractSheetHeaderValidation.js';
import { ContractSheetsAppendError } from '../services/contractSheetsErrors.js';
import { normalizeContractRequestIp, resolveContractRequestId, } from '../services/contractRequestContext.js';
import { validateContractSubmission } from '../services/validateContractSubmission.js';
import { GoogleServiceAccountConfigurationError } from '../utils/googleServiceAccountAuth.js';
import { getContractPasswordSession } from '../services/contractPasswordAuth.js';
function defaultLog(entry) {
    console.error('[contracts]', JSON.stringify(entry));
}
function resolveDependencies(overrides) {
    return {
        environment: overrides.environment ?? process.env,
        getPublicSchema: overrides.getPublicSchema ?? getPublicContractSchema,
        getConfig: overrides.getConfig ?? getContractSchemaConfig,
        validateSubmission: overrides.validateSubmission ?? validateContractSubmission,
        createSubmission: overrides.createSubmission ?? createContractSubmission,
        readAudit: overrides.readAudit ?? readContractAuditLog,
        generateRequestId: overrides.generateRequestId ?? randomUUID,
        log: overrides.log ?? defaultLog,
    };
}
function authenticate(req, environment) {
    const session = getContractPasswordSession(req, environment);
    return authenticateContractRequest({
        authorization: req.get('Authorization'),
        authenticatedUserId: req.get('X-Authenticated-User-Id'),
        developmentUserId: req.get('X-User-Id'),
        ...(session ? {
            passwordSession: {
                userId: session.userId,
                email: session.email,
                isAdmin: session.isAdmin,
            },
        } : {}),
    }, environment);
}
function setProtectedHeaders(res, requestId, audit = false) {
    res.set('Cache-Control', 'no-store');
    res.set('X-Request-Id', requestId);
    if (audit)
        res.set('X-Content-Type-Options', 'nosniff');
}
function sendAuthenticationError(res, error) {
    if (error instanceof ContractAuthenticationError) {
        res.status(401).json({
            error: 'AUTHENTICATION_REQUIRED',
            message: error.message,
            retriable: false,
        });
        return true;
    }
    if (error instanceof ContractAuthorizationError) {
        res.status(403).json({
            error: 'FORBIDDEN',
            message: error.message,
            retriable: false,
        });
        return true;
    }
    return false;
}
function getErrorName(error) {
    return error instanceof Error ? error.name : 'UnknownError';
}
function logOperationalError(dependencies, route, status, error, requestId) {
    try {
        dependencies.log({
            event: 'contract_route_error',
            route,
            status,
            errorName: getErrorName(error),
            ...(requestId ? { requestId } : {}),
        });
    }
    catch {
        // Observability must never alter the API response.
    }
}
function sendSubmitError(res, error, dependencies, requestId) {
    if (sendAuthenticationError(res, error))
        return;
    if (error instanceof ContractConfigurationError ||
        error instanceof GoogleServiceAccountConfigurationError) {
        logOperationalError(dependencies, 'submit', 500, error, requestId);
        res.status(500).json({
            error: 'CONTRACT_CONFIGURATION_ERROR',
            message: error.message,
            retriable: false,
        });
        return;
    }
    if (error instanceof ContractMappingError ||
        error instanceof ContractSheetMappingConfigurationError) {
        logOperationalError(dependencies, 'submit', 500, error, requestId);
        res.status(500).json({
            error: 'CONTRACT_MAPPING_ERROR',
            message: error.message,
            retriable: false,
        });
        return;
    }
    if (error instanceof ContractSheetsAppendError) {
        const status = error.retriable ? 503 : 502;
        logOperationalError(dependencies, 'submit', status, error, requestId);
        res.status(status).json({
            error: 'GOOGLE_SHEETS_APPEND_FAILED',
            message: error.message,
            retriable: error.retriable,
        });
        return;
    }
    if (error instanceof ContractAuditPersistenceError) {
        logOperationalError(dependencies, 'submit', 500, error, requestId);
        res.status(500).json({
            error: 'CONTRACT_AUDIT_PERSISTENCE_FAILED',
            message: error.message,
            retriable: false,
            appendCompleted: true,
            submissionId: error.submissionId,
            requestId: error.requestId,
        });
        return;
    }
    logOperationalError(dependencies, 'submit', 500, error, requestId);
    res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'The contract submission could not be completed.',
        retriable: false,
    });
}
function validationErrors(result) {
    return result.errors.map((issue) => ({
        field: issue.path.startsWith('fields.')
            ? issue.path.slice('fields.'.length)
            : issue.path,
        message: issue.message,
    }));
}
export function createContractsRouter(dependencyOverrides = {}) {
    const dependencies = resolveDependencies(dependencyOverrides);
    const router = Router();
    router.get('/schemas/:schemaId', (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            const schema = dependencies.getPublicSchema(req.params.schemaId ?? '', dependencies.environment);
            res.set('Cache-Control', 'public, max-age=300');
            res.status(200).json(schema);
        }
        catch (error) {
            if (error instanceof ContractSchemaNotFoundError) {
                res.status(404).json({
                    error: 'SCHEMA_NOT_FOUND',
                    message: error.message,
                    retriable: false,
                });
                return;
            }
            if (error instanceof ContractConfigurationError) {
                logOperationalError(dependencies, 'schema', 500, error);
                res.status(500).json({
                    error: 'CONTRACT_CONFIGURATION_ERROR',
                    message: error.message,
                    retriable: false,
                });
                return;
            }
            logOperationalError(dependencies, 'schema', 500, error);
            res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'The contract schema could not be loaded.',
                retriable: false,
            });
        }
    });
    router.post('/submit', async (req, res) => {
        const requestId = resolveContractRequestId(req.get('X-Request-Id'), dependencies.generateRequestId);
        setProtectedHeaders(res, requestId);
        try {
            const principal = authenticate(req, dependencies.environment);
            const validation = dependencies.validateSubmission(req.body);
            if (!validation.success) {
                const unknownSchema = validation.errors.some((issue) => issue.code === 'unknown_schema');
                res.status(unknownSchema ? 404 : 400).json({
                    error: unknownSchema ? 'SCHEMA_NOT_FOUND' : 'VALIDATION_FAILED',
                    message: unknownSchema
                        ? 'The requested contract schema is not registered.'
                        : 'Contract submission validation failed.',
                    retriable: false,
                    errors: validationErrors(validation),
                });
                return;
            }
            const attributedSubmission = principal.mode === 'api_key'
                ? validation.data
                : {
                    ...validation.data,
                    meta: {
                        ...validation.data.meta,
                        userId: principal.userId,
                    },
                };
            const config = dependencies.getConfig(validation.data.schemaId, dependencies.environment);
            const receipt = await dependencies.createSubmission({
                submission: attributedSubmission,
                config,
                requestId,
                ip: normalizeContractRequestIp(req.ip),
            });
            res.status(200).json({ receipt });
        }
        catch (error) {
            sendSubmitError(res, error, dependencies, requestId);
        }
    });
    router.get('/audits/:submissionId', async (req, res) => {
        const requestId = resolveContractRequestId(req.get('X-Request-Id'), dependencies.generateRequestId);
        setProtectedHeaders(res, requestId, true);
        try {
            const principal = authenticate(req, dependencies.environment);
            const audit = await dependencies.readAudit(req.params.submissionId ?? '');
            authorizeContractUserScope(principal, audit.userId);
            res.status(200).json(audit);
        }
        catch (error) {
            if (sendAuthenticationError(res, error))
                return;
            if (error instanceof InvalidContractSubmissionIdError) {
                res.status(400).json({
                    error: 'INVALID_SUBMISSION_ID',
                    message: error.message,
                    retriable: false,
                });
                return;
            }
            if (error instanceof ContractAuditNotFoundError) {
                res.status(404).json({
                    error: 'AUDIT_NOT_FOUND',
                    message: error.message,
                    retriable: false,
                });
                return;
            }
            if (error instanceof ContractAuditIntegrityError) {
                logOperationalError(dependencies, 'audit', 500, error, requestId);
                res.status(500).json({
                    error: 'AUDIT_INTEGRITY_ERROR',
                    message: 'The audit record is unreadable. Contact an administrator.',
                    retriable: false,
                });
                return;
            }
            logOperationalError(dependencies, 'audit', 500, error, requestId);
            res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'The audit record could not be loaded.',
                retriable: false,
            });
        }
    });
    return router;
}
export default createContractsRouter();
//# sourceMappingURL=contracts.js.map