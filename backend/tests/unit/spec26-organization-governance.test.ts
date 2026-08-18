import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInvitationToken,
  invitationTokenMatches,
  redactInvitationSecrets,
} from '../../src/organizations/invitationTokens.js';
import {
  ROLE_CAPABILITIES,
  ROLE_CAPABILITY_REGISTRY_VERSION,
  allowedInvitationRoles,
  canManageMembership,
  hasOrganizationCapability,
} from '../../src/organizations/roleCapabilities.js';
import { OrganizationDomainError } from '../../src/organizations/errors.js';
import {
  REQUIRED_DELETION_RECEIPTS,
  assertDeletionCanFinalize,
} from '../../src/organizations/organizationLifecycleService.js';
import {
  assertActiveOwnerRemains,
  assertMembershipTransition,
  assertOrganizationTransition,
} from '../../src/organizations/stateMachines.js';
import {
  normalizeOrganizationEmail,
  validateBrandColor,
  validateFeatureDefaults,
  validateOrganizationSlug,
  validateTimeZone,
} from '../../src/organizations/validation.js';

test('SPEC-26 role registry is versioned, complete, and denies unknown or inactive authority', () => {
  assert.equal(ROLE_CAPABILITY_REGISTRY_VERSION, 1);
  assert.equal(ROLE_CAPABILITIES.owner.has('billing.manage'), true);
  assert.equal(ROLE_CAPABILITIES.admin.has('members.manage_admin'), false);
  assert.equal(ROLE_CAPABILITIES.member.has('contracts.write'), true);
  assert.equal(ROLE_CAPABILITIES.viewer.has('files.read'), false);
  assert.equal(hasOrganizationCapability('unknown', 'active', 'active', 'organization.read'), false);
  assert.equal(hasOrganizationCapability('owner', 'removed', 'active', 'organization.read'), false);
  assert.equal(hasOrganizationCapability('admin', 'active', 'suspended', 'organization.read'), false);
  assert.equal(hasOrganizationCapability('owner', 'active', 'suspended', 'organization.export'), true);
  assert.deepEqual(allowedInvitationRoles('admin'), ['member', 'viewer']);
  assert.deepEqual(allowedInvitationRoles('owner'), ['admin', 'member', 'viewer']);
  assert.equal(canManageMembership('admin', 'admin'), false);
  assert.equal(canManageMembership('admin', 'viewer'), true);
});

test('organization identifiers and identity presentation fields are canonicalized safely', () => {
  assert.equal(validateOrganizationSlug('  Solar-Norte '), 'solar-norte');
  assert.throws(() => validateOrganizationSlug('api'));
  assert.throws(() => validateOrganizationSlug('-azar'));
  assert.equal(normalizeOrganizationEmail(' MEMBER@Example.COM '), 'member@example.com');
  assert.throws(() => normalizeOrganizationEmail('not-an-email'));
  assert.equal(validateTimeZone('America/Caracas'), 'America/Caracas');
  assert.throws(() => validateTimeZone('Mars/Olympus'));
});

test('branding and feature defaults accept only bounded allowlisted values', () => {
  assert.equal(validateBrandColor('#000000'), '#000000');
  assert.equal(validateBrandColor(null), null);
  assert.throws(() => validateBrandColor('url(javascript:alert(1))'));
  assert.deepEqual(validateFeatureDefaults({ property_form_mode: 'guided' }), { property_form_mode: 'guided' });
  assert.throws(() => validateFeatureDefaults({ grants_admin: true }));
});

test('invitation tokens contain 256 bits, compare safely, and redact recursively', () => {
  const token = createInvitationToken();
  assert.ok(token.raw_token.length >= 43);
  assert.match(token.token_hash, /^[0-9a-f]{64}$/u);
  assert.equal(invitationTokenMatches(token.raw_token, token.token_hash), true);
  assert.equal(invitationTokenMatches(`${token.raw_token}x`, token.token_hash), false);
  assert.deepEqual(redactInvitationSecrets({ invitation_token: token.raw_token, nested: { token_hash: token.token_hash } }), {
    invitation_token: '[REDACTED]', nested: { token_hash: '[REDACTED]' },
  });
});

test('organization, membership, and last-owner state transitions fail closed', () => {
  assert.doesNotThrow(() => assertOrganizationTransition('active', 'suspended'));
  assert.throws(() => assertOrganizationTransition('deleted', 'active'), OrganizationDomainError);
  assert.doesNotThrow(() => assertMembershipTransition('suspended', 'active'));
  assert.throws(() => assertMembershipTransition('removed', 'active'), OrganizationDomainError);
  assert.doesNotThrow(() => assertMembershipTransition('removed', 'active', true));
  assert.doesNotThrow(() => assertActiveOwnerRemains([
    { role: 'owner', status: 'active' }, { role: 'admin', status: 'active' },
  ]));
  assert.throws(() => assertActiveOwnerRemains([
    { role: 'owner', status: 'removed' }, { role: 'admin', status: 'active' },
  ]), (error: unknown) => error instanceof OrganizationDomainError && error.code === 'LAST_OWNER_REQUIRED');
});

test('final deletion fails closed for legal holds or any missing cleanup receipt', () => {
  assert.throws(() => assertDeletionCanFinalize({
    active_legal_hold: true,
    completed_receipts: REQUIRED_DELETION_RECEIPTS,
  }), OrganizationDomainError);
  assert.throws(() => assertDeletionCanFinalize({
    active_legal_hold: false,
    completed_receipts: REQUIRED_DELETION_RECEIPTS.filter((value) => value !== 'backups'),
  }), OrganizationDomainError);
  assert.doesNotThrow(() => assertDeletionCanFinalize({
    active_legal_hold: false,
    completed_receipts: REQUIRED_DELETION_RECEIPTS,
  }));
});
