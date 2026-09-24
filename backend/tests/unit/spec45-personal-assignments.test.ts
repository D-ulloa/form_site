import test from 'node:test';
import assert from 'node:assert/strict';
import { InquilinoProfileSchema, InvitationAcceptanceSchema, publicMembership } from '../../src/organizations/personalProfile.js';
import { ROLE_CAPABILITIES } from '../../src/organizations/roleCapabilities.js';
import { createRequestCursorCodec } from '../../src/arrangements/requestCursor.js';
import { createArrangementAssignmentsService, ManagerRequest, PersonalRequest } from '../../src/services/arrangementAssignments.js';
import { RequestRecord } from '../../src/arrangements/requestRepository.js';
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
