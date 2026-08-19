import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditService, type AuditAppendInput, type AuditRepository } from '../../src/platform/audit.js';
import { boundedPageSize, createCursorCodec } from '../../src/platform/cursor.js';
import { PlatformError, safeErrorEnvelope } from '../../src/platform/errors.js';
import { fairJobOrder, nextFailureState, nextRetryAt } from '../../src/platform/jobs.js';
import { createSafeMetrics } from '../../src/platform/metrics.js';
import {
  createDistributedRateLimiter,
  type DistributedRateLimitStore,
  type RateLimitDecision,
} from '../../src/platform/rateLimit.js';
import { createStructuredLogger, redactTelemetry } from '../../src/platform/redaction.js';
import { decideRestoredIntent, sha256Hex, validateExportManifest } from '../../src/platform/recovery.js';
import { isValidRequestId, resolveRequestId } from '../../src/platform/requestId.js';
import { createOrganizationScope, assertRowsInOrganization } from '../../src/platform/scope.js';
import { assertQuotaAvailable, createUsageService, type UsageEventRecord } from '../../src/platform/usage.js';

const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const scope = createOrganizationScope(organizationId);

test('request IDs accept only bounded syntax and generate unpredictable replacements', () => {
  assert.equal(isValidRequestId('req_client:1'), true);
  assert.equal(isValidRequestId('bad id'), false);
  assert.equal(resolveRequestId('req_client:1'), 'req_client:1');
  const generated = resolveRequestId('x'.repeat(129));
  assert.match(generated, /^req_[A-Za-z0-9_-]+$/u);
  assert.notEqual(generated, resolveRequestId(undefined));
});

test('organization scope is validated and returned rows fail on cross-organization data', () => {
  assert.equal(scope.organization_id, organizationId);
  assert.throws(() => createOrganizationScope('azar'));
  assert.doesNotThrow(() => assertRowsInOrganization(scope, [{ organization_id: organizationId }]));
  assert.throws(() => assertRowsInOrganization(scope, [{ organization_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }]));
});

test('request errors expose only safe stable envelopes and bounded retry timing', () => {
  const envelope = safeErrorEnvelope(new PlatformError('RATE_LIMITED', { retry_after_seconds: 1.2 }), 'req_safe');
  assert.deepEqual(envelope, {
    status: 429,
    body: { error: { code: 'RATE_LIMITED', request_id: 'req_safe' } },
    retry_after_seconds: 2,
  });
  assert.equal(safeErrorEnvelope(new Error('database password leaked'), 'req_safe').body.error.code,
    'DEPENDENCY_UNAVAILABLE');
  assert.throws(() => boundedPageSize(101), PlatformError);
  assert.equal(boundedPageSize(undefined), 25);
});

test('telemetry recursively redacts secrets, PII keys, payloads, paths, and signed URLs', async () => {
  const canary = 'CANARY_PRIVATE_VALUE';
  const redacted = redactTelemetry({
    action: 'contract.submit', authorization: canary, nested: {
      email: canary, storage_path: canary, payload: { harmless: canary },
      provider_error: `https://example.test/file?signature=${canary}`,
    },
  });
  assert.doesNotMatch(JSON.stringify(redacted), new RegExp(canary, 'u'));
  const written: Record<string, unknown>[] = [];
  await createStructuredLogger({ write: (event) => { written.push({ ...event }); } }).write({ token: canary });
  assert.equal(written.length, 1);
  assert.doesNotMatch(JSON.stringify(written), new RegExp(canary, 'u'));
});

test('metrics accept bounded operational labels and reject customer or uncontrolled labels', async () => {
  const seen: string[] = [];
  const metrics = createSafeMetrics({ record: (name) => { seen.push(name); } });
  await metrics.record('rate_limit.decision', 1, { action: 'contract.submit', outcome: 'allowed' });
  assert.deepEqual(seen, ['rate_limit.decision']);
  await assert.rejects(metrics.record('authorization.denied', 1, { email: 'private@example.test' }));
  await assert.rejects(metrics.record('authorization.denied', 1, { action: 'private value with spaces' }));
});

test('required audit validates actor/schema, redacts metadata, and fails closed on storage outage', async () => {
  let appended: AuditAppendInput | undefined;
  const repository: AuditRepository = { append: async (_scope, input) => { appended = input; } };
  await createAuditService(repository).appendRequired(scope, {
    request_id: 'req_audit', actor: { actor_type: 'member', actor_membership_id: organizationId },
    action: 'member.role_changed', target_type: 'membership', outcome: 'succeeded',
    source: 'api.members', metadata: { token: 'secret' },
  });
  assert.equal(appended?.metadata?.token, '[REDACTED]');
  await assert.rejects(createAuditService({ append: async () => { throw new Error('offline'); } })
    .appendRequired(scope, {
      request_id: 'req_audit', actor: { actor_type: 'system_worker' }, action: 'export.created',
      target_type: 'export', outcome: 'succeeded', source: 'worker.export',
    }), (error: unknown) => error instanceof PlatformError && error.code === 'AUDIT_UNAVAILABLE');
});

class AtomicFakeLimiter implements DistributedRateLimitStore {
  private consumed = 0;
  async consume(input: Parameters<DistributedRateLimitStore['consume']>[0]): Promise<RateLimitDecision> {
    if (this.consumed + input.cost > input.limit) {
      return { allowed: false, remaining: 0, retry_after_seconds: input.window_seconds,
        policy_key: input.policy_key };
    }
    this.consumed += input.cost;
    return { allowed: true, remaining: input.limit - this.consumed, retry_after_seconds: 0,
      policy_key: input.policy_key };
  }
}

test('distributed limiter hashes subjects and shares atomic capacity across independent clients', async () => {
  const store = new AtomicFakeLimiter();
  const pepper = 'p'.repeat(32);
  const first = createDistributedRateLimiter(store, pepper);
  const second = createDistributedRateLimiter(store, pepper);
  for (let index = 0; index < 10; index += 1) {
    await (index % 2 ? first : second).consume({
      policy_key: 'auth.password_login', principal_type: 'ip', principal_id: 'private@example.test',
      now: new Date('2026-08-18T00:00:00Z'),
    });
  }
  await assert.rejects(second.consume({
    policy_key: 'auth.password_login', principal_type: 'ip', principal_id: 'private@example.test',
  }), (error: unknown) => error instanceof PlatformError && error.code === 'RATE_LIMITED');
});

test('limiter outage fails closed and does not reveal the target', async () => {
  const limiter = createDistributedRateLimiter({ consume: async () => { throw new Error('redis target'); } }, 'p'.repeat(32));
  await assert.rejects(limiter.consume({
    policy_key: 'support.activate', principal_type: 'operator', principal_id: 'operator@example.test',
  }), (error: unknown) => error instanceof PlatformError && error.code === 'LIMITER_UNAVAILABLE');
});

test('usage registry is idempotency-ready and quotas restrict without granting authority', async () => {
  const rows = new Map<string, UsageEventRecord>();
  const usage = createUsageService({
    record: async (recordScope, input) => {
      const key = `${recordScope.organization_id}:${input.metric_key}:${input.idempotency_key}`;
      const existing = rows.get(key);
      if (existing) return existing;
      const record = { ...input, id: organizationId, organization_id: recordScope.organization_id,
        occurred_at: '2026-08-18T00:00:00Z' };
      rows.set(key, record);
      return record;
    },
  });
  const input = { idempotency_key: 'operation-123', metric_key: 'contracts.created' as const,
    quantity: 1, unit: 'count', source_type: 'contract', actor_type: 'member' as const,
    request_id: 'req_usage' };
  assert.equal((await usage.record(scope, input)).id, (await usage.record(scope, input)).id);
  assert.equal(rows.size, 1);
  assert.doesNotThrow(() => assertQuotaAvailable({ consumed: 2, reserved: 1, limit_value: 4 }, 1));
  assert.throws(() => assertQuotaAvailable({ consumed: 2, reserved: 1, limit_value: 3 }, 1), PlatformError);
});

test('opaque cursors bind filters and reject tampering or unbounded pages', () => {
  const codec = createCursorCodec('c'.repeat(32));
  const cursor = codec.encode({ created_at: '2026-08-18T00:00:00Z', id: organizationId,
    filter_fingerprint: 'status=active' });
  assert.equal(codec.decode(cursor, 'status=active').id, organizationId);
  assert.throws(() => codec.decode(`${cursor}x`, 'status=active'), PlatformError);
  assert.throws(() => codec.decode(cursor, 'status=suspended'), PlatformError);
});

test('fair scheduling rotates organizations and retry state is bounded', () => {
  const jobs = [
    { id: 'a1', organization_id: 'a', priority_band: 5, available_at: '2026-08-18T00:00:00Z', attempts: 0, max_attempts: 3, state: 'queued' as const },
    { id: 'a2', organization_id: 'a', priority_band: 5, available_at: '2026-08-18T00:00:01Z', attempts: 0, max_attempts: 3, state: 'queued' as const },
    { id: 'b1', organization_id: 'b', priority_band: 5, available_at: '2026-08-18T00:00:02Z', attempts: 0, max_attempts: 3, state: 'queued' as const },
  ];
  assert.deepEqual(fairJobOrder(jobs, new Date('2026-08-18T01:00:00Z')).map((job) => job.id), ['a1', 'b1', 'a2']);
  assert.equal(nextFailureState(2, 3), 'retryable');
  assert.equal(nextFailureState(3, 3), 'dead_letter');
  assert.equal(nextRetryAt(20, new Date(0), () => 1).getTime(), 3_600_000);
});

test('recovery manifests are organization-bound and external effects remain paused until reconciled', () => {
  const manifest = {
    organization_id: organizationId, export_id: organizationId, schema_version: 1,
    time_boundary: '2026-08-17T00:00:00Z', included_data_classes: ['audit'],
    excluded_data_classes: [], object_counts: { audit_events: 1 }, checksums: { audit_events: sha256Hex('one') },
    encryption_reference: 'kms/key/version', expires_at: '2026-08-20T00:00:00Z',
  };
  assert.doesNotThrow(() => validateExportManifest(manifest, organizationId, new Date('2026-08-18T00:00:00Z')));
  assert.throws(() => validateExportManifest(manifest, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
  assert.equal(decideRestoredIntent('sent'), 'pause');
  assert.equal(decideRestoredIntent('unknown', 'provider_confirmed'), 'record_recovered_receipt');
  assert.equal(decideRestoredIntent('processing', 'provider_missing'), 'resume_idempotently');
  assert.equal(decideRestoredIntent('unknown', 'provider_unknown'), 'block');
});
