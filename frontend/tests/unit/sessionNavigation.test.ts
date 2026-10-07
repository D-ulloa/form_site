import { describe, expect, it } from 'vitest';
import { safeSessionReturnPath, sessionLoginPath } from '../../src/app/auth/sessionNavigation.ts';

describe('Safe login return paths', () => {
  it.each(['/t/azar', '/t/azar/properties/new', '/t/azar/settings/members',
    '/t/azar/contracts/admin/123', '/invitations/accept'])('preserves an application route: %s', path => {
    expect(safeSessionReturnPath(path)).toBe(path);
  });

  it.each(['https://other.example/test', '//other.example/test', '/\\other.example/test',
    '/t/azar/../../login', '/t/azar/properties/new?token=secret', '/contracts/entry/client?token=secret',
    '/auth/callback', '/login', '/t/%2F%2Fother.example/properties/new'])('rejects unsafe or unapproved paths: %s', path => {
    expect(safeSessionReturnPath(path)).toBe('/');
  });

  it('encodes the destination and only includes an expiration reason when requested', () => {
    expect(sessionLoginPath('/t/azar/properties/new', true)).toBe('/login?reason=session_expired&return_to=%2Ft%2Fazar%2Fproperties%2Fnew');
    expect(sessionLoginPath('/')).toBe('/login');
    expect(sessionLoginPath('//other.example/test', true)).toBe('/login?reason=session_expired');
  });
});
