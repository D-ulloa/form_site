import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { InquilinoProfileSchema, InvitationAcceptanceSchema, publicMembership } from '../../src/organizations/personalProfile.js';
import { ROLE_CAPABILITIES } from '../../src/organizations/roleCapabilities.js';
import { createRequestCursorCodec } from '../../src/arrangements/requestCursor.js';
import { createArrangementAssignmentsService, ManagerRequest, PersonalRequest } from '../../src/services/arrangementAssignments.js';
import { createArrangementRequestsService } from '../../src/services/arrangementRequests.js';
import { ArrangementRequestError, RequestRecord } from '../../src/arrangements/requestRepository.js';
import { arrangementHarness, environment, A, B, ORDER } from '../fixtures/arrangements.js';
import { createOrganizationScope } from '../../src/platform/scope.js';
import type { OrganizationActorContext } from '../../src/organizations/types.js';

test('SPEC45 phone validation preserves text, rejects authority injection and leaves generic membership private', () => {
  assert.deepEqual(InquilinoProfileSchema.parse({ contact_number: ' +58 (0412) 012-3456 ' }), { contact_number: '+58 (0412) 012-3456' });
  for (const contact_number of [null, 1234567, '', '123456', '1'.repeat(16), '+58x4121234567', '1\n2345678', '１２３４５６７', '++1234567']) {
    assert.equal(InquilinoProfileSchema.safeParse({ contact_number }).success, false);
  }
  assert.equal(InvitationAcceptanceSchema.safeParse({ inquilino_profile: { contact_number: '1234567' }, exempt: true }).success, false);
  assert.equal(InvitationAcceptanceSchema.safeParse({ personal_profile: { name: 'Ana', contact_number: '123', occupation: 'Pintora' }, inquilino_profile: { contact_number: '1234567' } }).success, false);
  const { state } = arrangementHarness();
  assert.doesNotMatch(JSON.stringify(publicMembership({ ...state.membership, inquilino_contact_number: '1234567' } as never)), /1234567/);
});
test('SPEC45 capabilities grant assigned reads without granting directories, mutations or general assets', () => {
  assert.equal(ROLE_CAPABILITIES.personal.has('personal.arrangements.read'), true);
  for (const capability of ['arrangements.read', 'files.read', 'members.read', 'arrangements.status.update', 'arrangements.assignment.manage'] as const) assert.equal(ROLE_CAPABILITIES.personal.has(capability), false);
  for (const role of ['owner', 'admin', 'member'] as const) assert.equal(ROLE_CAPABILITIES[role].has('arrangements.assignment.manage'), true);
  assert.equal(ROLE_CAPABILITIES.viewer.has('arrangements.requester.read'), false);
});
test('SPEC45 cursors cannot cross audience, membership, selector or organization', () => {
  const binding = { organization_id: A, property_id: null, status: null, limit: 25, audience: 'personal', membership_id: ORDER };
  const codec = createRequestCursorCodec('x'.repeat(48), binding);
  const cursor = codec.encode({ id: ORDER, at: null });
  for (const change of [{ audience: 'manager' }, { membership_id: B }, { organization_id: B }, { ordering: 'id.asc' }]) {
    assert.throws(() => createRequestCursorCodec('x'.repeat(48), { ...binding, ...change }).decode(cursor), /INVALID_CURSOR/);
  }
});
const baseRecord = { id: ORDER, organization_id: A, name: 'Leak', description: 'Leak', status: 'in_progress', property: { id: ORDER, name: 'Casa' },
  created_at: null, submitted_at: null, updated_at: null, version: 3, legacy: false, created_by_you: false, assets: [], work_report: null };
function legacyRequestCursor(scope: string, id: string, at: string | null): string {
  const body = Buffer.from(JSON.stringify({ scope, position: { id, at } })).toString('base64url');
  return `${body}.${createHmac('sha256', environment.PLATFORM_CURSOR_SECRET!).update(body).digest('base64url')}`;
}
test('SPEC45 strict audience DTOs keep contacts out of viewer/tenant and assignees out of personal', () => {
  const personal = { ...baseRecord, requester: { name: 'Author', email: 'author@example.test', contact_number: null } };
  assert.equal(PersonalRequest.safeParse(personal).success, true);
  assert.equal(RequestRecord.safeParse(personal).success, false);
  assert.equal(PersonalRequest.safeParse({ ...personal, assignee: null }).success, false);
  assert.equal(ManagerRequest.safeParse({ ...personal, assignee: null }).success, true);
});
test('SPEC45 service rejects forged audiences/filters and unsafe repository projections before returning data', async () => {
  const { state } = arrangementHarness(); let calls = 0;
  const actor: OrganizationActorContext = { user_id: state.membership.user_id, display_name: 'test', request_id: 'spec45-test', organization: state.organization,
    membership: { ...state.membership, role: 'personal' } };
  const service = createArrangementAssignmentsService({ async call() { calls++; return { organization_id: A, property_id: null, items: [{ ...baseRecord, requester: null, assignee: null }] }; } }, {} as never, environment);
  await assert.rejects(service.listAssigned(createOrganizationScope(A), actor, 'manager', {}));
  for (const raw of [{ status: 'solved' }, { assigned_personal_membership_id: B }, { property_id: ORDER }, { organization_id: B }]) await assert.rejects(service.listAssigned(createOrganizationScope(A), actor, 'personal', raw));
  assert.equal(calls, 0);
  await assert.rejects(service.listAssigned(createOrganizationScope(A), actor, 'personal', {}));
  assert.equal(calls, 1);
});

test('SPEC-47 order search matches name/description/property, rejects personal search and binds cursors', async () => {
  const { state } = arrangementHarness();
  const manager: OrganizationActorContext = { user_id: state.membership.user_id, display_name: 'Owner', request_id: 'spec47-orders',
    organization: state.organization, membership: { ...state.membership, role: 'owner' } };
  const personal: OrganizationActorContext = { ...manager, membership: { ...state.membership, role: 'personal' } };
  const rows = [
    { ...baseRecord, id: '50000000-0000-4000-8000-000000000010', name: 'Goteo', description: 'Fuga en cocina', property: { id: ORDER, name: 'Casa Norte' }, status: 'open' as const, submitted_at: '2026-09-01T00:00:00Z', requester: null, assignee: null },
    { ...baseRecord, id: '50000000-0000-4000-8000-000000000011', name: 'Pintura', description: 'Muro exterior', property: { id: ORDER, name: 'Ático' }, status: 'open' as const, submitted_at: '2026-09-02T00:00:00Z', requester: null, assignee: null },
    { ...baseRecord, id: '50000000-0000-4000-8000-000000000012', name: 'Limpieza', description: 'Profunda', property: { id: ORDER, name: 'Casa Sur' }, status: 'in_progress' as const, submitted_at: '2026-09-03T00:00:00Z', requester: null, assignee: null },
  ];
  const calls: Array<Record<string, unknown>> = [];
  const service = createArrangementAssignmentsService({ async call(_scope, _actor, action, input) {
    if (action === 'v3.internal.list') {
      calls.push(input);
      const after = typeof input.after_id === 'string' ? input.after_id : null;
      const status = typeof input.status === 'string' ? input.status : null;
      const source = status ? rows.filter(row => row.status === status) : rows;
      const start = after ? source.findIndex(row => row.id === after) + 1 : 0;
      const limit = Number(input.limit);
      return { organization_id: A, property_id: null, items: source.slice(start, start + limit) };
    }
    throw new Error(`unexpected ${action}`);
  } }, {} as never, environment);
  const scope = createOrganizationScope(A);

  const byProperty = await service.listAssigned(scope, manager, 'manager', { limit: '10', search: 'casa' });
  assert.deepEqual(byProperty.items.map(item => item.id), [rows[0]!.id, rows[2]!.id]);
  const byDescription = await service.listAssigned(scope, manager, 'manager', { limit: '10', search: 'fuga' });
  assert.deepEqual(byDescription.items.map(item => item.id), [rows[0]!.id]);
  const unicode = await service.listAssigned(scope, manager, 'manager', { limit: '10', search: 'atico' });
  assert.deepEqual(unicode.items.map(item => item.id), [rows[1]!.id]);
  const statusAndSearch = await service.listAssigned(scope, manager, 'manager', { limit: '10', status: 'open', search: 'casa' });
  assert.deepEqual(statusAndSearch.items.map(item => item.id), [rows[0]!.id]);
  const paged = await service.listAssigned(scope, manager, 'manager', { limit: '1', search: 'casa' });
  assert.deepEqual(paged.items.map(item => item.id), [rows[0]!.id]);
  assert.ok(paged.next_cursor);
  const next = await service.listAssigned(scope, manager, 'manager', { limit: '1', search: 'casa', cursor: paged.next_cursor! });
  assert.deepEqual(next.items.map(item => item.id), [rows[2]!.id]);
  assert.equal(next.next_cursor, null);
  await assert.rejects(service.listAssigned(scope, manager, 'manager', { limit: '1', search: 'otro', cursor: paged.next_cursor! }));
  await assert.rejects(service.listAssigned(scope, personal, 'personal', { search: 'casa' }),
    (error: unknown) => error instanceof ArrangementRequestError && error.code === 'INVALID_REQUEST' && error.status === 400);
  await assert.rejects(service.listAssigned(scope, manager, 'manager', { search: 'a'.repeat(101) }));
  assert.ok(calls.every(call => typeof call.limit === 'number'));

  const oldNoSearchScope = JSON.stringify(['arrangements.orders', 3, A, null, null, 1,
    'submitted_at.desc.nullslast,id.desc', 'manager', manager.membership.id]);
  const oldCursor = legacyRequestCursor(oldNoSearchScope, rows[0]!.id, rows[0]!.submitted_at);
  const legacyPage = await service.listAssigned(scope, manager, 'manager', { limit: '1', cursor: oldCursor });
  assert.deepEqual(legacyPage.items.map(item => item.id), [rows[1]!.id]);

  const viewer: OrganizationActorContext = { ...manager, membership: { ...manager.membership, role: 'viewer' } };
  let viewerReads = 0;
  const viewerService = createArrangementAssignmentsService({ async call() {
    viewerReads += 1;
    return { organization_id: A, property_id: null, items: [baseRecord] };
  } }, {} as never, environment);
  const invalidSearch = (error: unknown) => error instanceof ArrangementRequestError && error.code === 'INVALID_REQUEST' && error.status === 400;
  await assert.rejects(viewerService.listAssigned(scope, viewer, 'viewer', { search: 'casa' }), invalidSearch);
  await assert.rejects(viewerService.listAssigned(scope, viewer, 'viewer', { search: '   ' }), invalidSearch);
  assert.equal(viewerReads, 0);
  await viewerService.listAssigned(scope, viewer, 'viewer', { search: '' });
  assert.equal(viewerReads, 1);
});

test('SPEC47 no-search cursors remain compatible for request lists and assignees', async () => {
  const { state } = arrangementHarness();
  const manager: OrganizationActorContext = { user_id: state.membership.user_id, display_name: 'Owner', request_id: 'spec47-legacy-cursors',
    organization: state.organization, membership: { ...state.membership, role: 'owner' } };
  const nextId = '50000000-0000-4000-8000-000000000020';
  let requestAfter: unknown;
  const requestsService = createArrangementRequestsService({ async call(_scope, _actor, action, input) {
    assert.equal(action, 'internal.list');
    requestAfter = input.after_id;
    return { organization_id: A, property_id: null, items: [{ ...baseRecord, id: nextId, name: 'Second' }] };
  } } as never, { storage: {} as never, detectContent: async () => ({ detected_mime: 'image/png' }) }, environment);
  const oldRequestScope = JSON.stringify(['arrangements.orders', 2, A, null, null, 1, 'submitted_at.desc.nullslast,id.desc']);
  const requestCursor = legacyRequestCursor(oldRequestScope, ORDER, null);
  const requestPage = await requestsService.list(createOrganizationScope(A), manager, false, { limit: '1', cursor: requestCursor });
  assert.deepEqual(requestPage.items.map(item => item.id), [nextId]);
  assert.equal(requestAfter, ORDER);

  let assigneeAfter: unknown;
  const assignmentService = createArrangementAssignmentsService({ async call(_scope, _actor, action, input) {
    assert.equal(action, 'v3.internal.assignees');
    assigneeAfter = input.after_id;
    return { organization_id: A, items: [{ id: B, name: 'Técnico', occupation: 'Mantenimiento' }] };
  } }, {} as never, environment);
  const oldAssigneeScope = JSON.stringify(['arrangements.orders', 3, A, null, null, 1, 'id.asc', 'assignees', manager.membership.id]);
  const assigneeCursor = legacyRequestCursor(oldAssigneeScope, ORDER, null);
  const assigneePage = await assignmentService.assignees(createOrganizationScope(A), manager, { limit: '1', cursor: assigneeCursor });
  assert.deepEqual(assigneePage.items.map(item => item.id), [B]);
  assert.equal(assigneeAfter, ORDER);
});
