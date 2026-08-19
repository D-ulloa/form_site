import assert from 'node:assert/strict';
import test from 'node:test';
import { PlatformError } from '../../src/platform/errors.js';
import { createOrganizationScope } from '../../src/platform/scope.js';
import {
  assertIdempotentReplay,
  assertPropertyLifecycle,
  assertPropertyVersion,
  canRetryPropertyRun,
  canSeeProperty,
  propertyRequestFingerprint,
  redactPropertyChangeSummary,
  requirePropertyCapability,
} from '../../src/properties/multiTenantDomain.js';
import type { OrganizationRequestContext } from '../../src/contracts/multiTenantDomain.js';

const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const context: OrganizationRequestContext = {
  scope: createOrganizationScope(organizationId), request_id: 'req_spec30', context_epoch: 1,
  user_id: userId, membership_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  role: 'member', record_visibility: 'assigned_only', capabilities: new Set(['properties.read']),
};

test('property visibility is tenant-first and applies assigned-only creator or assignee rules', () => {
  assert.equal(canSeeProperty(context, {
    organization_id: organizationId, created_by_user_id: userId, assigned_to_user_id: null,
  }), true);
  assert.equal(canSeeProperty(context, {
    organization_id: organizationId, created_by_user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    assigned_to_user_id: userId,
  }), true);
  assert.equal(canSeeProperty(context, {
    organization_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', created_by_user_id: userId,
    assigned_to_user_id: userId,
  }), false);
  assert.doesNotThrow(() => requirePropertyCapability(context, 'properties.read'));
  assert.throws(() => requirePropertyCapability(context, 'properties.write'), PlatformError);
});

test('property versions, lifecycle, and retry state fail closed', () => {
  assert.doesNotThrow(() => assertPropertyVersion(3, 3));
  assert.throws(() => assertPropertyVersion(4, 3), PlatformError);
  assert.doesNotThrow(() => assertPropertyLifecycle('draft', 'active'));
  assert.doesNotThrow(() => assertPropertyLifecycle('active', 'archived'));
  assert.doesNotThrow(() => assertPropertyLifecycle('archived', 'active'));
  assert.throws(() => assertPropertyLifecycle('draft', 'archived'), PlatformError);
  assert.equal(canRetryPropertyRun({ state: 'partially_failed', retriable: true }), true);
  assert.equal(canRetryPropertyRun({ state: 'succeeded', retriable: true }), false);
  assert.equal(canRetryPropertyRun({ state: 'failed', retriable: false }), false);
});

test('property fingerprints are stable by key order and reject conflicting replay', () => {
  const left = propertyRequestFingerprint('publish', { b: 2, a: { y: true, x: 1 } });
  const right = propertyRequestFingerprint('publish', { a: { x: 1, y: true }, b: 2 });
  assert.equal(left, right);
  assert.match(left, /^[0-9a-f]{64}$/u);
  assert.doesNotThrow(() => assertIdempotentReplay(left, 'publish', { b: 2, a: { y: true, x: 1 } }));
  assert.throws(() => assertIdempotentReplay(left, 'publish', { a: 2 }), (error: unknown) =>
    error instanceof PlatformError && error.code === 'IDEMPOTENCY_CONFLICT');
});

test('property change summaries expose field names and counts but never values', () => {
  const summary = redactPropertyChangeSummary(
    { Calle: 'Azar secret', Precio: 10, Moneda: 'USD' },
    { Calle: 'Solar secret', Precio: 11, Moneda: 'USD' },
  );
  assert.deepEqual(summary, { changed_fields: ['Calle', 'Precio'], changed_field_count: 2 });
  assert.doesNotMatch(JSON.stringify(summary), /Azar secret|Solar secret/u);
});
