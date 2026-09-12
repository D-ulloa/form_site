import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createArrangementPropertyRepository, type ArrangementPropertyRepository } from '../../src/arrangements/arrangementPropertyRepository.js';
import { createArrangementPropertiesService } from '../../src/services/arrangementProperties.js';
import { createOrganizationScope } from '../../src/platform/scope.js';
import { OrganizationDomainError } from '../../src/organizations/errors.js';
import { OrganizationService } from '../../src/organizations/organizationService.js';
import { InvitationWorkflowService } from '../../src/organizations/invitationWorkflow.js';
import { CaptureInvitationDeliveryAdapter } from '../../src/organizations/invitationDelivery.js';
import { arrangementHarness, A, B, environment } from '../fixtures/arrangements.js';
import type { OrganizationActorContext, OrganizationRole } from '../../src/organizations/types.js';

const P = '60000000-0000-4000-8000-000000000001';
const P2 = '60000000-0000-4000-8000-000000000002';
const scope = createOrganizationScope(A);
function actor(role: OrganizationRole = 'owner'): OrganizationActorContext {
  const { state } = arrangementHarness();
  return { organization: state.organization, membership: { ...state.membership, role },
    user_id: state.membership.user_id, display_name: 'Owner', request_id: 'spec42-test' };
}
const code = (expected: string) => (error: unknown) => error instanceof OrganizationDomainError && error.code === expected;

test('SPEC-42 service enforces capability, scope and normalized input before persistence', async () => {
  const writes: unknown[] = [];
  const service = createArrangementPropertiesService({ async create(_scope, input) { writes.push(input); return { id: P, name: input.name }; } } as ArrangementPropertyRepository);
  for (const role of ['owner', 'admin'] as const) assert.equal((await service.create(scope, actor(role), { name: ' Casa ' }, 'property-attempt')).name, 'Casa');
  for (const role of ['member', 'viewer', 'inquilino'] as const) await assert.rejects(service.create(scope, actor(role), { name: 'Casa' }, 'property-attempt'), code('FORBIDDEN'));
  await assert.rejects(service.create(createOrganizationScope(B), actor(), { name: 'Casa' }, 'property-attempt'), code('NOT_FOUND'));
  for (const input of [{ name: '' }, { name: '  ' }, { name: 'a'.repeat(201) }, { name: 'Casa', id: P }, { name: 'Casa', organization_id: B }]) await assert.rejects(service.create(scope, actor(), input, 'property-attempt'));
  await assert.rejects(service.create(scope, actor(), { name: 'Casa' }, undefined));
  assert.equal(writes.length, 2);
});

test('SPEC-42 property cursor is bound to collection, property, organization and page size', async () => {
  const reads: unknown[] = [];
  const service = createArrangementPropertiesService({ async list(_scope, input) {
    reads.push(input);
    return { organization_id: A, items: input.after_id ? [{ id: P2, name: 'Second' }] : [{ id: P, name: 'First' }, { id: P2, name: 'Second' }] };
  } } as ArrangementPropertyRepository, environment);
  const first = await service.list(scope, actor(), 'properties', null, { limit: '1' });
  assert.equal(first.items.length, 1); assert.ok(first.next_cursor);
  assert.equal((await service.list(scope, actor(), 'properties', null, { limit: '1', cursor: first.next_cursor })).items[0]?.id, P2);
  for (const [collection, property, query] of [['properties', null, { limit: '2' }], ['available', null, { limit: '1' }], ['inquilinos', P, { limit: '1' }]] as const) {
    await assert.rejects(service.list(scope, actor(), collection, property, { ...query, cursor: first.next_cursor }));
  }
  assert.equal(reads.length, 2);
});

test('SPEC-42 member/viewer never reach people persistence; inquilino cannot list properties', async () => {
  let reads = 0;
  const service = createArrangementPropertiesService({ async list() { reads++; return { organization_id: A, items: [] }; } } as ArrangementPropertyRepository, environment);
  for (const role of ['member', 'viewer'] as const) {
    await service.list(scope, actor(role), 'properties', null, {});
    for (const collection of ['inquilinos', 'invitations', 'available'] as const) await assert.rejects(service.list(scope, actor(role), collection, P, {}), code('FORBIDDEN'));
  }
  await assert.rejects(service.list(scope, actor('inquilino'), 'properties', null, {}), code('FORBIDDEN'));
  assert.equal(reads, 2);
});

test('SPEC-42 repository rejects extra fields, foreign scope and private provider errors', async () => {
  let data: unknown = { organization_id: A, items: [{ id: P, name: 'Casa' }] };
  let error: { message: string } | null = null;
  const client = { async rpc(_name: string, args: Record<string, unknown>) { assert.equal(args.p_organization_id, A); return { data, error }; } } as unknown as SupabaseClient;
  const repo = createArrangementPropertyRepository(client);
  const query = { actor_id: actor().membership.id, collection: 'properties' as const, property_id: null, after_id: null, limit: 26 };
  assert.equal((await repo.list(scope, query)).items.length, 1);
  for (const invalid of [{ organization_id: B, items: [] }, { organization_id: A, items: [{ id: P, name: 'Casa', email: 'private@example.test' }] }]) {
    data = invalid; await assert.rejects(repo.list(scope, query), code('DEPENDENCY_NOT_READY'));
  }
  error = { message: 'private-provider-secret' };
  await assert.rejects(repo.list(scope, query), err => code('DEPENDENCY_NOT_READY')(err) && !(err as Error).message.includes('secret'));
});

function invitationHarness() {
  let provisioned = 0, persisted = 0, prepareError: string | null = null, issued = true;
  const invitation = { id: P2, organization_id: A, intended_role: 'inquilino', status: 'pending', delivery_method: 'share_link',
    delivery_state: 'pending', expires_at: '2099-01-01T00:00:00Z', arrangement_property_id: P, token_version: 1, version: 1 };
  const workflow = new InvitationWorkflowService({} as never, new CaptureInvitationDeliveryAdapter(), { enabled: true,
    delivery_method: 'share_link', adapter: 'capture', public_base_url: 'https://app.example.test', template_version: 'v1',
    provider_reference_pepper: 'p'.repeat(48), webhook_secret: '' });
  const service = new OrganizationService({
    async preparePropertyInvitation() { if (prepareError) throw new OrganizationDomainError(prepareError as never); return { operation_id: P, invitation: null }; },
    async createInvitation(input: { arrangement_property_id: string; operation_id: string; intended_role: string }) {
      persisted++; assert.equal(input.arrangement_property_id, P); assert.equal(input.operation_id, P); assert.equal(input.intended_role, 'inquilino');
      return { ...invitation, link_issued: issued };
    },
  } as never, undefined, workflow, { async provision() { provisioned++; return { user_id: P, activation_required: true, outcome: 'created_activation_required' }; } } as never);
  return { service, counts: () => ({ provisioned, persisted }), fail: (value: string) => { prepareError = value; }, replay: () => { issued = false; } };
}
const invite = { email: 'new@example.test', intended_role: 'inquilino' as const, arrangement_property_id: P,
  idempotency_key: 'invitation-attempt', inviter_display_name: 'Owner', public_base_url: 'https://app.example.test' };

test('SPEC-42 invitation rejects missing property, invalid email and scoped conflicts before Auth', async () => {
  const h = invitationHarness();
  const { arrangement_property_id: _property, ...withoutProperty } = invite;
  await assert.rejects(h.service.inviteMember(withoutProperty, actor()), code('PROPERTY_REQUIRED'));
  await assert.rejects(h.service.inviteMember({ ...invite, email: 'invalid' }, actor()));
  for (const conflict of ['NOT_FOUND', 'ALREADY_A_MEMBER', 'INVITATION_ALREADY_PENDING']) {
    h.fail(conflict); await assert.rejects(h.service.inviteMember(invite, actor()), code(conflict));
  }
  assert.deepEqual(h.counts(), { provisioned: 0, persisted: 0 });
});

test('SPEC-42 issuance receipt has the property and a one-time fragment link; replay has no new token', async () => {
  const h = invitationHarness();
  const receipt = await h.service.inviteMember(invite, actor());
  assert.equal(receipt.arrangement_property_id, P);
  assert.match(receipt.share_url!, /\/invitations\/accept#invitation_token=/u);
  assert.equal(new URL(receipt.share_url!).search, '');
  h.replay();
  const replay = await h.service.inviteMember(invite, actor());
  assert.equal(replay.share_url, undefined); assert.equal(replay.next_action, 'rotate_or_revoke');
});

test('SPEC-42 lost acceptance response recovers only the authenticated current membership', async () => {
  let current = true;
  const membership = { ...actor().membership, role: 'inquilino' as const, arrangement_property_id: P };
  const workflow = new InvitationWorkflowService({
    async acceptHandoff() { throw new OrganizationDomainError('INVITATION_INVALID'); },
    async recoverAcceptedHandoff(input: { identity: { user_id: string } }) { assert.equal(input.identity.user_id, membership.user_id); return current ? membership : null; },
    async organizationSlug() { return 'azar'; },
  } as never, {} as never, {} as never);
  const identity = { user_id: membership.user_id, verified_email: 'owner@example.test', request_id: 'spec42-recovery' };
  assert.equal((await workflow.acceptHandoff('handle', 'binding', 'origin', identity)).membership.arrangement_property_id, P);
  current = false;
  await assert.rejects(workflow.acceptHandoff('handle', 'binding', 'origin', identity), code('INVITATION_INVALID'));
});
