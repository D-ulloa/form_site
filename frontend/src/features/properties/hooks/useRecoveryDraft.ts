import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  createRecoveryDraft, discardRecoveryDraft, getRecoveryDraft, listRecoveryDrafts,
  recordRecoveryFailure, saveRecoveryDraft,
  type RecoveryDraft, type RecoveryDraftSummary, type RecoveryFailure, type RecoverySnapshot,
} from '../services/recoveryDraftApi.ts';

function draftSaveErrorMessage(error: unknown, failure = false): string {
  if (axios.isAxiosError(error)) {
    const body: unknown = error.response?.data;
    if (body && typeof body === 'object' && 'error' in body
      && body.error === 'INVALID_RECOVERY_DRAFT') {
      const rawDetails = 'details' in body ? body.details : undefined;
      const details = Array.isArray(rawDetails)
        ? rawDetails.filter((item): item is string => typeof item === 'string').join(' · ').slice(0, 300)
        : typeof rawDetails === 'string' ? rawDetails.slice(0, 300) : '';
      return details
        ? `El servidor rechazó los datos del borrador: ${details}`
        : 'El servidor rechazó los datos del borrador. Revisá los datos e intentá nuevamente.';
    }
  }
  return failure
    ? 'No se pudo registrar el error en el borrador. Conservá esta página abierta e intentá nuevamente.'
    : 'No se pudo guardar el borrador. Revisá tu conexión e intentá nuevamente.';
}

function useScopedState<T>(scopeKey: string, initialValue: T): [T, (value: T) => void] {
  const [state, setState] = useState({ scopeKey, value: initialValue });
  const setValue = useCallback((value: T) => setState({ scopeKey, value }), [scopeKey]);
  return [state.scopeKey === scopeKey ? state.value : initialValue, setValue];
}

export function useRecoveryDraft(organization: string, userId: string | undefined) {
  const scopeKey = `${organization}:${userId ?? ''}`;
  const [drafts, setDrafts] = useScopedState<RecoveryDraftSummary[]>(scopeKey, []);
  const [currentDraft, setCurrentDraft] = useScopedState<RecoveryDraft | null>(scopeKey, null);
  const [saveError, setSaveError] = useScopedState<string | null>(scopeKey, null);
  const [isSaving, setIsSaving] = useScopedState(scopeKey, false);
  const draftRef = useRef<RecoveryDraft | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeScopeRef = useRef(scopeKey);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const result = await listRecoveryDrafts(organization);
    if (activeScopeRef.current === scopeKey) setDrafts(result);
  }, [organization, scopeKey, setDrafts, userId]);

  useLayoutEffect(() => {
    activeScopeRef.current = scopeKey;
    draftRef.current = null;
    queueRef.current = Promise.resolve();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, [scopeKey]);

  useEffect(() => {
    void refresh().catch(() => {
      if (activeScopeRef.current === scopeKey) setSaveError('No se pudieron cargar los borradores.');
    });
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [refresh, scopeKey, setSaveError]);

  const enqueue = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const next = queueRef.current.catch(() => undefined).then(operation);
    queueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const remember = useCallback((draft: RecoveryDraft) => {
    if (activeScopeRef.current !== scopeKey) return;
    draftRef.current = draft;
    setCurrentDraft(draft);
    setSaveError(null);
    void refresh().catch(() => {
      if (activeScopeRef.current === scopeKey) setSaveError('No se pudo actualizar la lista de borradores.');
    });
  }, [refresh, scopeKey, setCurrentDraft, setSaveError]);

  const persist = useCallback((snapshot: RecoverySnapshot): Promise<RecoveryDraft> => enqueue(async () => {
    if (activeScopeRef.current !== scopeKey) throw new Error('RECOVERY_SCOPE_CHANGED');
    setIsSaving(true);
    try {
      const existing = draftRef.current;
      const saved = existing
        ? await saveRecoveryDraft(organization, existing, snapshot)
        : await createRecoveryDraft(organization, snapshot);
      remember(saved);
      return saved;
    } catch (error) {
      if (activeScopeRef.current === scopeKey) {
        setSaveError(draftSaveErrorMessage(error));
      }
      throw error;
    } finally {
      if (activeScopeRef.current === scopeKey) setIsSaving(false);
    }
  }), [enqueue, organization, remember, scopeKey, setIsSaving, setSaveError]);

  const cancelScheduled = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const scheduleSave = useCallback((snapshot: RecoverySnapshot) => {
    if (!userId) return;
    cancelScheduled();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist(snapshot).catch(() => undefined);
    }, 700);
  }, [cancelScheduled, persist, userId]);

  const saveNow = useCallback((snapshot: RecoverySnapshot) => {
    cancelScheduled();
    return persist(snapshot);
  }, [cancelScheduled, persist]);

  const recordFailure = useCallback((snapshot: RecoverySnapshot, failure: RecoveryFailure): Promise<RecoveryDraft> => {
    cancelScheduled();
    return enqueue(async () => {
      if (activeScopeRef.current !== scopeKey) throw new Error('RECOVERY_SCOPE_CHANGED');
      setIsSaving(true);
      try {
        let existing = draftRef.current;
        if (!existing) {
          existing = await createRecoveryDraft(organization, snapshot);
          remember(existing);
        }
        const saved = await recordRecoveryFailure(organization, existing, snapshot, failure);
        remember(saved);
        return saved;
      } catch (error) {
        if (activeScopeRef.current === scopeKey) {
          setSaveError(draftSaveErrorMessage(error, true));
        }
        throw error;
      } finally {
        if (activeScopeRef.current === scopeKey) setIsSaving(false);
      }
    });
  }, [cancelScheduled, enqueue, organization, remember, scopeKey, setIsSaving, setSaveError]);

  const restore = useCallback(async (draftId: string): Promise<RecoveryDraft> => {
    cancelScheduled();
    await queueRef.current;
    const restored = await getRecoveryDraft(organization, draftId);
    if (activeScopeRef.current !== scopeKey) throw new Error('RECOVERY_SCOPE_CHANGED');
    remember(restored);
    return restored;
  }, [cancelScheduled, organization, remember, scopeKey]);

  const discard = useCallback(async (draftId: string): Promise<void> => {
    cancelScheduled();
    await queueRef.current;
    await discardRecoveryDraft(organization, draftId);
    if (activeScopeRef.current !== scopeKey) return;
    if (draftRef.current?.id === draftId) {
      draftRef.current = null;
      setCurrentDraft(null);
    }
    await refresh();
  }, [cancelScheduled, organization, refresh, scopeKey, setCurrentDraft]);

  const markComplete = useCallback(async (): Promise<void> => {
    cancelScheduled();
    await queueRef.current;
    if (activeScopeRef.current !== scopeKey) return;
    draftRef.current = null;
    setCurrentDraft(null);
    await refresh();
  }, [cancelScheduled, refresh, scopeKey, setCurrentDraft]);

  return { drafts, currentDraft, saveError, isSaving, refresh, scheduleSave, saveNow,
    recordFailure, restore, discard, markComplete };
}
