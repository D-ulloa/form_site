// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecoveryDraft } from '../../src/features/properties/hooks/useRecoveryDraft.ts';
import {
  createRecoveryDraft, listRecoveryDrafts, recordRecoveryFailure, saveRecoveryDraft,
  type RecoveryDraft, type RecoveryDraftSummary, type RecoverySnapshot,
} from '../../src/features/properties/services/recoveryDraftApi.ts';

vi.mock('../../src/features/properties/services/recoveryDraftApi.ts', () => ({
  createRecoveryDraft: vi.fn(),
  discardRecoveryDraft: vi.fn(),
  getRecoveryDraft: vi.fn(),
  listRecoveryDrafts: vi.fn(),
  recordRecoveryFailure: vi.fn(),
  saveRecoveryDraft: vi.fn(),
}));

const snapshot: RecoverySnapshot = {
  formValues: { Titulo: 'Casa', Calle: 'Falsa' }, mediaManifest: [], coverFileName: '',
};
const draft: RecoveryDraft = {
  id: '22222222-2222-4222-8222-222222222222', version: 1,
  form_values: snapshot.formValues, media_manifest: [], cover_file_name: '',
  status: 'open', last_error: null, updated_at: '2026-10-12T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listRecoveryDrafts).mockResolvedValue([]);
  vi.mocked(createRecoveryDraft).mockResolvedValue(draft);
  vi.mocked(saveRecoveryDraft).mockResolvedValue({ ...draft, version: 2 });
  vi.mocked(recordRecoveryFailure).mockResolvedValue({ ...draft, version: 2,
    last_error: { phase: 'submit', code: 'PARTIAL_FAILURE', message: 'Make falló',
      outcome: 'partial_failure' } });
});

afterEach(() => cleanup());

describe('property recovery draft state', () => {
  it('saves before submission and appends a failure to the same draft', async () => {
    const { result } = renderHook(() => useRecoveryDraft('azar', 'user-1'));
    await waitFor(() => expect(listRecoveryDrafts).toHaveBeenCalledWith('azar'));

    await act(async () => { await result.current.saveNow(snapshot); });
    expect(createRecoveryDraft).toHaveBeenCalledWith('azar', snapshot);
    expect(result.current.currentDraft?.id).toBe(draft.id);

    const failure = { phase: 'submit' as const, code: 'PARTIAL_FAILURE', message: 'Make falló',
      outcome: 'partial_failure' as const };
    await act(async () => { await result.current.recordFailure(snapshot, failure); });
    expect(recordRecoveryFailure).toHaveBeenCalledWith('azar', draft, snapshot, failure);
    expect(result.current.currentDraft?.last_error?.outcome).toBe('partial_failure');
  });

  it('does not expose another organization’s pending list after a switch', async () => {
    let resolveOldList!: (value: RecoveryDraftSummary[]) => void;
    vi.mocked(listRecoveryDrafts).mockImplementation((organization) =>
      organization === 'azar' ? new Promise((resolve) => { resolveOldList = resolve; }) : Promise.resolve([]));
    const { result, rerender } = renderHook(({ organization }) => useRecoveryDraft(organization, 'user-1'),
      { initialProps: { organization: 'azar' } });
    await waitFor(() => expect(listRecoveryDrafts).toHaveBeenCalledWith('azar'));
    rerender({ organization: 'solar' });
    await waitFor(() => expect(listRecoveryDrafts).toHaveBeenCalledWith('solar'));
    await act(async () => resolveOldList([{ id: draft.id, version: 1, title: 'Azar', address: '',
      mediaCount: 0, updatedAt: draft.updated_at, lastError: null }]));
    expect(result.current.drafts).toEqual([]);
  });
});
