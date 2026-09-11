import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createArrangementOrderRepository } from '../../src/arrangements/arrangementOrderRepository.js';
import { createListArrangementOrders } from '../../src/services/listArrangementOrders.js';
import { createOrganizationScope } from '../../src/platform/scope.js';
import { PlatformError } from '../../src/platform/errors.js';
import { A, B, ORDER, environment } from '../fixtures/arrangements.js';

const scope = createOrganizationScope(A);
const row = { id: ORDER, organization_id: A, name: 'Ventana', status: 'open' };
const page = { organization_id: A, items: [row], available_statuses: ['in_progress', 'open'], next_after_id: null };

test('SPEC-39 persisted reads send scope/filter/cursor to SQL and assert every returned row', async () => {
  const calls: unknown[] = [];
  let data: unknown = page;
  const client = { async rpc(name: string, args: unknown) { calls.push({ name, args }); return { data, error: null }; } } as SupabaseClient;
  const repository = createArrangementOrderRepository(client);
  assert.deepEqual(await repository.listOpen(scope, { status: 'open', after_id: null, limit: 25 }), page);
  assert.deepEqual(calls, [{ name: 'spec39_list_arrangement_orders', args: {
    p_organization_id: A, p_status: 'open', p_after_id: null, p_limit: 25,
  } }]);
  for (const corrupt of [null, { ...page, organization_id: B }, { ...page, items: [{ ...row, organization_id: B }] },
    { ...page, items: [{ ...row, id: 'not-persisted' }] }]) {
    data = corrupt;
    await assert.rejects(repository.listOpen(scope, { status: null, after_id: null, limit: 25 }));
  }
});

test('SPEC-39 provider errors never become empty results or expose raw provider messages', async () => {
  const client = { async rpc() { return { data: page, error: { message: 'secret-provider-canary' } }; } } as unknown as SupabaseClient;
  await assert.rejects(createArrangementOrderRepository(client).listOpen(scope, { status: null, after_id: null, limit: 25 }),
    error => error instanceof PlatformError && error.code === 'DEPENDENCY_UNAVAILABLE' && !error.message.includes('canary'));
});

test('SPEC-39 cursor binds scope, filter, page size and a stable UUID position', async () => {
  let afterId: string | null = null;
  const list = createListArrangementOrders({ async listOpen(_scope, query) {
    afterId = query.after_id;
    return query.after_id ? { ...page, items: [] } : { ...page, next_after_id: ORDER };
  } }, environment);
  const first = await list(scope, { status: 'open', limit: '1' });
  assert.deepEqual(first.items, [{ id: ORDER, name: 'Ventana', status: 'open' }]);
  assert.ok(first.next_cursor);
  const next = await list(scope, { status: 'open', limit: '1', cursor: first.next_cursor });
  assert.equal(afterId, ORDER);
  assert.equal(next.next_cursor, null);
  for (const [org, query] of [
    [createOrganizationScope(B), { status: 'open', limit: '1', cursor: first.next_cursor }],
    [scope, { status: 'in_progress', limit: '1', cursor: first.next_cursor }],
    [scope, { status: 'open', limit: '2', cursor: first.next_cursor }],
    [scope, { status: 'open', limit: '1', cursor: 'tampered.' + first.next_cursor }],
  ] as const) {
    await assert.rejects(list(org, query), error => error instanceof PlatformError && error.code === 'INVALID_CURSOR');
  }
});

test('SPEC-39 rejects partial, mismatched or non-progressing repository responses', async () => {
  for (const corrupt of [
    { ...page, organization_id: B }, { ...page, items: [{ ...row, organization_id: B }] },
    { ...page, items: [row, row] }, { ...page, items: [{ ...row, status: 'closed' }] },
    { ...page, next_after_id: '50000000-0000-4000-8000-000000000002' },
  ]) {
    const list = createListArrangementOrders({ async listOpen() { return corrupt; } }, environment);
    await assert.rejects(list(scope, { status: 'open' }));
  }
});
