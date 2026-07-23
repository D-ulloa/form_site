import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ContractMappingError, mapContractFieldsToSheetRow, } from '../mappers/contractSheetRowMapper.js';
import { buildContractAuditLog, persistContractAuditLog, } from './contractAuditLogger.js';
import { appendContractSheetRow, } from './googleSheetsService.js';
import { CONTRACT_METRICS, contractMetrics, } from './contractMetrics.js';
export class ContractAuditPersistenceError extends Error {
    retriable = false;
    appendCompleted = true;
    submissionId;
    requestId;
    constructor(args) {
        super('The Sheet row was appended, but its audit receipt could not be persisted. Reconcile the submission before retrying.', { cause: args.cause });
        this.name = 'ContractAuditPersistenceError';
        this.submissionId = args.submissionId;
        this.requestId = args.requestId;
    }
}
export function generateContractSubmissionId(timestamp) {
    const date = timestamp.toISOString().slice(0, 10);
    const suffix = (randomUUID().split('-')[0] ?? randomUUID()).toUpperCase();
    return `SUB-${date}-${suffix}`;
}
function recordMetricSafely(operation) {
    try {
        operation();
    }
    catch (error) {
        console.error('[contracts] Failed to record submission metric:', error);
    }
}
export async function createContractSubmission(input, overrides = {}) {
    const dependencies = {
        appendRow: overrides.appendRow ?? appendContractSheetRow,
        persistAudit: overrides.persistAudit ?? persistContractAuditLog,
        now: overrides.now ?? (() => new Date()),
        monotonicNow: overrides.monotonicNow ?? (() => performance.now()),
        generateSubmissionId: overrides.generateSubmissionId ?? generateContractSubmissionId,
        metrics: overrides.metrics ?? contractMetrics,
    };
    const startedAt = dependencies.monotonicNow();
    recordMetricSafely(() => dependencies.metrics.increment(CONTRACT_METRICS.total));
    try {
        if (input.submission.schemaId !== input.config.schemaId ||
            input.submission.contractType !== input.config.contractType) {
            throw new ContractMappingError('Validated submission does not match the configured contract schema.');
        }
        const createdAt = dependencies.now();
        const timestamp = createdAt.toISOString();
        const submissionId = dependencies.generateSubmissionId(createdAt);
        const schema = {
            schemaId: input.config.schemaId,
            contractType: input.config.contractType,
            sections: input.config.sections,
            columnMap: input.config.sheet.columnMap,
        };
        const mappedRow = mapContractFieldsToSheetRow(schema, input.submission.fields);
        const appendResult = await dependencies.appendRow({
            spreadsheetId: input.config.sheet.spreadsheetId,
            sheetName: input.config.sheet.sheetName,
            columnHeaders: mappedRow.columnHeaders,
            row: mappedRow.values,
        });
        const audit = buildContractAuditLog({
            schema,
            fields: input.submission.fields,
            mappedRow,
            spreadsheetId: input.config.sheet.spreadsheetId,
            sheetName: input.config.sheet.sheetName,
            appendedRange: appendResult.appendedRange,
            submissionId,
            userId: input.submission.meta.userId,
            timestamp,
            requestId: input.requestId,
            ip: input.ip,
        });
        try {
            await dependencies.persistAudit(audit);
        }
        catch (error) {
            throw new ContractAuditPersistenceError({
                submissionId,
                requestId: input.requestId,
                cause: error,
            });
        }
        recordMetricSafely(() => dependencies.metrics.increment(CONTRACT_METRICS.success));
        return {
            submissionId,
            timestamp,
            sheetUrl: `https://docs.google.com/spreadsheets/d/${encodeURIComponent(input.config.sheet.spreadsheetId)}/edit`,
            appendedRange: appendResult.appendedRange,
            auditUrl: `/api/contracts/audits/${submissionId}`,
        };
    }
    catch (error) {
        recordMetricSafely(() => dependencies.metrics.increment(CONTRACT_METRICS.failure));
        throw error;
    }
    finally {
        const latencyMs = Math.max(0, dependencies.monotonicNow() - startedAt);
        recordMetricSafely(() => dependencies.metrics.observe(CONTRACT_METRICS.latency, latencyMs));
    }
}
//# sourceMappingURL=createContractSubmission.js.map