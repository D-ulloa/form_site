import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { SubmissionLog } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '..', '..', 'logs');

/**
 * Persists a submission log as `logs/{submission_id}.json`.
 * Errors are caught and logged to console — this must never crash a request.
 */
export async function persistSubmissionLog(log: SubmissionLog): Promise<void> {
  if (process.env.VERCEL) {
    console.log(JSON.stringify({
      event: 'property_submission_log_not_persisted',
      organization: 'azar_legacy',
      submission_id: log.submission_id,
      outcome: log.outcome,
    }));
    return;
  }

  try {
    await mkdir(LOGS_DIR, { recursive: true });
    const filepath = join(LOGS_DIR, `${log.submission_id}.json`);
    await writeFile(filepath, JSON.stringify(log, null, 2), 'utf-8');
    console.log(`[logger] Persisted submission log → ${log.submission_id}.json`);
  } catch (err) {
    console.error('[logger] Failed to persist submission log:', err);
  }
}
