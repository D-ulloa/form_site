import type { SubmissionLog } from '../types.js';
/**
 * Persists a submission log as `logs/{submission_id}.json`.
 * Errors are caught and logged to console — this must never crash a request.
 */
export declare function persistSubmissionLog(log: SubmissionLog): Promise<void>;
//# sourceMappingURL=submissionLogger.d.ts.map