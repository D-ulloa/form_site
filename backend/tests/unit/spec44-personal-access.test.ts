import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { arrangementHarness, A, B, environment } from '../fixtures/arrangements.js';
import { ROLE_CAPABILITIES, hasOrganizationCapability, allowedInvitationRoles, canManageMembership } from '../../src/organizations/roleCapabilities.js';
import { createOrganizationContextRouter } from '../../src/routes/identity.js';
import { PersonalProfileSchema, InvitationAcceptanceSchema, publicMembership } from '../../src/organizations/personalProfile.js';
import { OrganizationService } from '../../src/organizations/organizationService.js';
import { InvitationWorkflowService } from '../../src/organizations/invitationWorkflow.js';
import { CaptureInvitationDeliveryAdapter } from '../../src/organizations/invitationDelivery.js';
import type { OrganizationActorContext, OrganizationRole } from '../../src/organizations/types.js';

test('SPEC-44 capabilities separate personal home, scoped invitations, and general governance', () => {
  assert.deepEqual([...ROLE_CAPABILITIES.personal], ['personal.home.read']);
  for (const role of ['owner','admin','member','viewer','inquilino','personal'] as const) {
    assert.equal(hasOrganizationCapability(role,'active','active','arrangements.personal.invite'), ['owner','admin','member'].includes(role));
    assert.equal(allowedInvitationRoles(role).includes('personal'), false);
  }
  assert.equal(ROLE_CAPABILITIES.member.has('members.invite'), false);
  assert.equal(canManageMembership('admin','personal'), true);
  for (const status of ['suspended','removed'] as const) assert.equal(hasOrganizationCapability('personal',status,'active','personal.home.read'),false);
  for (const status of ['suspended','pending_deletion','deleted'] as const) assert.equal(hasOrganizationCapability('personal','active',status,'personal.home.read'),false);
});

test('SPEC-44 validates all three text fields, Unicode lengths and strict authority-free payloads', () => {
  const profile = { name: '  Liv  ', contact_number: ' +58 00123-456 ', occupation: ' Electricista ' };
  assert.deepEqual(PersonalProfileSchema.parse(profile), { name:'Liv',contact_number:'+58 00123-456',occupation:'Electricista' });
  assert.equal(PersonalProfileSchema.parse({ ...profile,name:'😀'.repeat(120) }).name.length,240);
  for (const invalid of [{}, { ...profile,name:null }, { ...profile,name:'  ' }, { ...profile,contact_number:123 },
    { ...profile,occupation:'a'.repeat(121) }, { ...profile,name:'A\nB' }, { ...profile,name:'A\u0085B' }, { ...profile,role:'owner' }]) {
    assert.equal(PersonalProfileSchema.safeParse(invalid).success,false);
  }
  assert.equal(InvitationAcceptanceSchema.safeParse({ personal_profile:profile, organization_id:B }).success,false);
});

test('SPEC-44 personal context has no product authority or profile and denies foreign/suspended memberships', async () => {
  const h=arrangementHarness();
  h.state.membership={ ...h.state.membership,role:'personal',personal_name:'private' } as typeof h.state.membership;
  h.app.use('/api',createOrganizationContextRouter(h.sessions,h.identity,environment));
  const response=await request(h.app).get('/api/organizations/azar/context').set('Cookie',h.cookie).expect(200);
  assert.equal(response.body.home_destination,'personal');
  assert.deepEqual(response.body.capabilities,['personal.home.read']);
  assert.ok(!JSON.stringify(response.body).includes('private'));
  assert.ok(!JSON.stringify(publicMembership(h.state.membership)).includes('private'));
  await request(h.app).get(`/api/organizations/${B}/context`).set('Cookie',h.cookie).expect(404);
  await request(h.app).get(`/api/organizations/${A}/arrangements/orders`).set('Cookie',h.cookie).expect(403);
  for (const status of ['suspended','removed'] as const) {
    h.state.membership={ ...h.state.membership,status };
    await request(h.app).get('/api/organizations/azar/context').set('Cookie',h.cookie).expect(404);
  }
  assert.deepEqual(h.state.reads,[]);
  h.state.membership={ ...h.state.membership,role:'member',status:'active' };
  const disabled=await request(h.app).get('/api/organizations/azar/context').set('Cookie',h.cookie).expect(200);
  assert.equal(disabled.body.capabilities.includes('arrangements.personal.invite'),false);
});

test('SPEC-44 issuance authorizes before provisioning, binds its operation, and replays without tokens', async () => {
  const { state }=arrangementHarness();
  const calls:string[]=[];
  const op='60000000-0000-4000-8000-000000000001';
  const invitation={ id:op,organization_id:A,intended_role:'personal',status:'pending',delivery_method:'share_link',
    delivery_state:'pending',expires_at:'2099-01-01T00:00:00Z',token_version:1,version:1,arrangement_property_id:null };
  let replay=false;
  const rolloutEnvironment={PERSONAL_INVITATIONS_ENABLED:'true'};
  const workflow=new InvitationWorkflowService({} as never,new CaptureInvitationDeliveryAdapter(),{ enabled:true,delivery_method:'share_link',
    adapter:'capture',public_base_url:'https://app.example.test',template_version:'v1',provider_reference_pepper:'p'.repeat(48),webhook_secret:'' });
  const service=new OrganizationService({} as never,undefined,workflow,{ async provision(input: {idempotency_key:string},actor:{personal_invitation_operation_id:string}) {
    calls.push('provision');assert.equal(input.idempotency_key,`personal:${op}`);assert.equal(actor.personal_invitation_operation_id,op);
    return { user_id:op,activation_required:false,outcome:'existing_active' };
  } } as never,{ async prepare() {calls.push('prepare');return {operation_id:op,invitation:replay?invitation:null};},
    async create(input:{email:string}) {calls.push('persist');assert.equal(input.email,'new@example.test');return {...invitation,link_issued:true};},
    async rotate() {calls.push('rotate');return invitation;},
    async revoke() {calls.push('revoke');return {...invitation,status:'revoked'};}
  } as never,rolloutEnvironment);
  const actor=(role:OrganizationRole):OrganizationActorContext=>({membership:{...state.membership,role},organization:state.organization,
    user_id:state.membership.user_id,display_name:'Invitante',request_id:'spec44-unit-test'});
  for (const role of ['viewer','inquilino','personal'] as const) await assert.rejects(service.invitePersonal({email:'new@example.test',idempotency_key:'spec44-key'},actor(role)));
  for (const intended_role of ['admin','member','viewer','inquilino','personal'] as const) await assert.rejects(service.inviteMember({email:'new@example.test',intended_role,inviter_display_name:'Member',public_base_url:''},actor('member')));
  assert.deepEqual(calls,[]);
  for (const role of ['owner','admin','member'] as const) {
    const result=await service.invitePersonal({email:' NEW@example.test ',idempotency_key:'spec44-key'},actor(role));
    assert.match(result.share_url!,/#invitation_token=/);
  }
  replay=true;calls.length=0;
  const result=await service.invitePersonal({email:'new@example.test',idempotency_key:'spec44-key'},actor('member'));
  assert.equal(result.share_url,undefined);assert.deepEqual(calls,['prepare']);
  rolloutEnvironment.PERSONAL_INVITATIONS_ENABLED='false';calls.length=0;
  await assert.rejects(service.invitePersonal({email:'new@example.test',idempotency_key:'spec44-key'},actor('member')),
    {code:'DEPENDENCY_NOT_READY'});
  assert.deepEqual(calls,[]);
  assert.match((await service.rotatePersonalInvitation(op,actor('member'))).share_url!,/#invitation_token=/);
  assert.equal((await service.revokePersonalInvitation(op,actor('member'))).status,'revoked');
  assert.deepEqual(calls,['rotate','revoke']);
});

test('SPEC-44 HTTP enforces actor matrix, strict bodies, CSRF, scope and distributed limits', async () => {
  let calls=0;
  const h=arrangementHarness(undefined,{personal:{async invitePersonal(){calls++;return {invitation_id:'test'};}} as never});
  const send=(body:unknown,org=A)=>request(h.app).post(`/api/organizations/${org}/arrangements/personal/invitations`)
    .set('Cookie',`${h.cookie}; form_site_csrf=${h.material.csrf_token}`).set('Origin','https://app.example.test').set('X-CSRF-Token',h.material.csrf_token)
    .set('Idempotency-Key','spec44-invite').send(body);
  for (const role of ['owner','admin','member','viewer','inquilino','personal'] as const) {
    h.state.membership={...h.state.membership,role};
    await send({email:'new@example.test'}).expect(['owner','admin','member'].includes(role)?201:403);
  }
  assert.equal(calls,3);h.state.membership={...h.state.membership,role:'member'};
  for (const extra of [{intended_role:'admin'},{organization_id:B},{personal_profile:{}},{arrangement_property_id:A}]) await send({email:'new@example.test',...extra}).expect(400);
  await send({email:'new@example.test'},B).expect(404);
  await request(h.app).post(`/api/organizations/${A}/arrangements/personal/invitations`).set('Cookie',h.cookie).send({email:'new@example.test'}).expect(403);
  h.state.allowed=false;await send({email:'new@example.test'}).expect(429);
  assert.equal(calls,3);
});
