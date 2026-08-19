import { describe, expect, it } from 'vitest';
import {
  consumeContractLinkFragment,
  contractQueryKeys,
  isCurrentContractResponse,
  preserveContractVersionConflict,
} from '../../src/features/contracts/services/multiTenantContractState';

const azar = { organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contextEpoch: 1 };
const solar = { organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', contextEpoch: 1 };

describe('SPEC-29 tenant contract state', () => {
  it('places immutable organization UUID and context epoch first in every query key', () => {
    expect(contractQueryKeys.list(azar, { status: 'open' }).slice(0, 3)).toEqual(['contracts', azar.organizationId, 1]);
    expect(contractQueryKeys.detail(azar, 'entry').slice(0, 3)).toEqual(['contracts', azar.organizationId, 1]);
    expect(contractQueryKeys.history(azar, 'entry').slice(0, 3)).toEqual(['contracts', azar.organizationId, 1]);
    expect(contractQueryKeys.templates(azar).slice(0, 3)).toEqual(['contracts', azar.organizationId, 1]);
  });

  it('drops delayed responses after tenant switch or epoch change', () => {
    expect(isCurrentContractResponse(azar, solar)).toBe(false);
    expect(isCurrentContractResponse(azar, { ...azar, contextEpoch: 2 })).toBe(false);
    expect(isCurrentContractResponse(azar, azar)).toBe(true);
  });

  it('preserves unsaved edits on optimistic concurrency conflict', () => {
    const fields = { direccion: 'Sin perder' };
    expect(preserveContractVersionConflict(fields, 2, 3)).toEqual({
      kind: 'version_conflict', expectedVersion: 2, latestVersion: 3, unsavedFields: fields,
    });
  });

  it('consumes link tokens from fragments and strips them from browser history', () => {
    let replacement = '';
    const token = consumeContractLinkFragment(
      { pathname: '/contracts/link', search: '?lang=es', hash: '#token=secret&step=client' } as Location,
      (_data, _unused, url) => { replacement = String(url); },
    );
    expect(token).toBe('secret');
    expect(replacement).toBe('/contracts/link?lang=es#step=client');
    expect(replacement).not.toContain('secret');
  });
});
