import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { resolveContractAuditLogsDirectory } from '../src/services/contractAuditLogger.js';

const expectedDefaultDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'logs',
);

test('audit directory resolves at call time from the environment', async () => {
  const configuredDirectory = await mkdtemp(join(tmpdir(), 'contract-audits-'));
  const previousValue = process.env.CONTRACT_AUDIT_LOGS_DIR;

  try {
    delete process.env.CONTRACT_AUDIT_LOGS_DIR;
    assert.equal(resolveContractAuditLogsDirectory(), expectedDefaultDirectory);

    process.env.CONTRACT_AUDIT_LOGS_DIR = configuredDirectory;
    assert.equal(resolveContractAuditLogsDirectory(), configuredDirectory);

    assert.equal(
      resolveContractAuditLogsDirectory({ logsDirectory: '/explicit/logs' }),
      '/explicit/logs',
    );
  } finally {
    if (previousValue === undefined) {
      delete process.env.CONTRACT_AUDIT_LOGS_DIR;
    } else {
      process.env.CONTRACT_AUDIT_LOGS_DIR = previousValue;
    }
    await rm(configuredDirectory, { recursive: true, force: true });
  }
});

test('blank audit directory configuration uses the backend logs directory', () => {
  assert.equal(
    resolveContractAuditLogsDirectory({}, { CONTRACT_AUDIT_LOGS_DIR: '   ' }),
    expectedDefaultDirectory,
  );
});
