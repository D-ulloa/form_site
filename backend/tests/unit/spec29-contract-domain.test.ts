import assert from 'node:assert/strict';
import test from 'node:test';
import { PlatformError } from '../../src/platform/errors.js';
import { createOrganizationScope } from '../../src/platform/scope.js';
import {
  PLATFORM_CONTRACT_BRANDING,
  assertActiveLink,
  assertContractStatusTransition,
  assertExpectedVersion,
  canSeeContract,
  contractLinkTokenMatches,
  createContractLinkToken,
  projectPublicContractBranding,
  requireContractCapability,
  validateContractTemplateDefinition,
  type OrganizationRequestContext,
} from '../../src/contracts/multiTenantDomain.js';

const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const baseContext: OrganizationRequestContext = {
  scope: createOrganizationScope(organizationId), request_id: 'req_spec29', context_epoch: 4,
  user_id: userId, membership_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  role: 'member', record_visibility: 'assigned_only', capabilities: new Set(['contracts.read']),
};

test('contract visibility always starts with organization and applies assigned-only policy', () => {
  assert.equal(canSeeContract(baseContext, { organization_id: organizationId, assigned_to_user_id: userId }), true);
  assert.equal(canSeeContract(baseContext, { organization_id: organizationId, assigned_to_user_id: null }), false);
  assert.equal(canSeeContract(baseContext, {
    organization_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', assigned_to_user_id: userId,
  }), false);
  assert.throws(() => requireContractCapability(baseContext, 'contracts.update'), PlatformError);
  assert.doesNotThrow(() => requireContractCapability(baseContext, 'contracts.read'));
});

test('contract concurrency and status transitions reject stale or destructive movement', () => {
  assert.doesNotThrow(() => assertExpectedVersion(3, 3));
  assert.throws(() => assertExpectedVersion(4, 3), (error: unknown) =>
    error instanceof PlatformError && error.code === 'VERSION_CONFLICT');
  assert.doesNotThrow(() => assertContractStatusTransition('complete', 'generar_contrato'));
  assert.doesNotThrow(() => assertContractStatusTransition('archived', 'archived'));
  assert.throws(() => assertContractStatusTransition('archived', 'open'), PlatformError);
});

test('external link tokens carry 256 bits, are peppered, and fail closed by state and role', () => {
  const pepper = 'pepper-that-is-at-least-thirty-two-bytes-long';
  const token = createContractLinkToken(pepper);
  assert.ok(token.raw_token.length >= 43);
  assert.match(token.token_hash, /^[0-9a-f]{64}$/u);
  assert.equal(contractLinkTokenMatches(token.raw_token, token.token_hash, pepper), true);
  assert.equal(contractLinkTokenMatches(`${token.raw_token}x`, token.token_hash, pepper), false);
  const link = { status: 'active', role: 'client', allowed_operations: ['read', 'submit'],
    expires_at: '2026-08-19T00:00:00Z' };
  assert.doesNotThrow(() => assertActiveLink(link, 'client', 'submit', new Date('2026-08-18T00:00:00Z')));
  assert.throws(() => assertActiveLink(link, 'user', 'submit', new Date('2026-08-18T00:00:00Z')), PlatformError);
  assert.throws(() => assertActiveLink(link, 'client', 'submit', new Date('2026-08-20T00:00:00Z')), PlatformError);
});

test('public branding is allowlisted and never has an Azar-specific fallback', () => {
  assert.deepEqual(projectPublicContractBranding(null), PLATFORM_CONTRACT_BRANDING);
  assert.deepEqual(projectPublicContractBranding({
    public_display_name: '<Solar>\u0000', primary_color: '#12ABEF',
    accent_color: 'url(javascript:alert(1))', logo_asset_id: 'not-a-uuid',
  }), {
    display_name: 'Solar', primary_color: '#12ABEF',
    accent_color: PLATFORM_CONTRACT_BRANDING.accent_color, logo_asset_id: null,
  });
  assert.doesNotMatch(JSON.stringify(PLATFORM_CONTRACT_BRANDING), /azar/iu);
});

test('template definitions are bounded, two-role, and reject executable extensions', () => {
  const definition = { schema_id: 'alquiler_v1', contract_type: 'rent',
    roles: { user: { sections: [] }, client: { sections: [] } }, sections: [] };
  assert.deepEqual(validateContractTemplateDefinition(definition), definition);
  assert.throws(() => validateContractTemplateDefinition({ ...definition, javascript: 'alert(1)' }));
  assert.throws(() => validateContractTemplateDefinition({ ...definition, roles: { user: {} } }));
});
