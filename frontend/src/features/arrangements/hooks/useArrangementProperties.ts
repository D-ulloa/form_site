import { useCallback, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { useAuthentication } from '../../../app/contexts/AuthenticationContext';
import { tenantQueryKey } from '../../../app/contexts/tenantState';
import { arrangementError, listArrangementCollection, type PropertyCollection } from '../services/arrangementPropertiesApi';

export function useArrangementAccessError() {
  const { refresh } = useAuthentication();
  const { organization, epoch } = useOrganization();
  const client = useQueryClient();
  const navigate = useNavigate();
  return useCallback((error: unknown) => {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status && [401, 403, 404].includes(status)) {
      const key = tenantQueryKey(organization.id, epoch, 'arrangements');
      void client.cancelQueries({ queryKey: key }).then(() => client.removeQueries({ queryKey: key }));
      if (status === 401) void refresh();
      navigate(status === 401 ? '/login' : '/', { replace: true });
    }
  }, [client, epoch, navigate, organization.id, refresh]);
}
export function useArrangementCollection<C extends PropertyCollection>(collection: C, propertyId: string | null = null) {
  const { organization, epoch } = useOrganization();
  const denied = useArrangementAccessError();
  const query = useInfiniteQuery({
    queryKey: tenantQueryKey(organization.id, epoch, 'arrangements', collection, propertyId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listArrangementCollection({ organizationId: organization.id, collection, propertyId, cursor: pageParam, signal }),
    getNextPageParam: page => page.next_cursor,
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false,
  });
  useEffect(() => { if (query.error) denied(query.error); }, [query.error, denied]);
  return query;
}

/** Response-only links never enter React Query's mutation cache. Unmount/hidden context aborts pending work. */
export function useArrangementOperation(errorMessage: (error: unknown) => string = arrangementError) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);
  const denied = useArrangementAccessError();
  useEffect(() => {
    active.current = true;
    // React Activity can resume this form after context revalidation aborted its request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(false);
    return () => { active.current = false; controller.current?.abort(); controller.current = null; };
  }, []);
  async function run<T>(work: (signal: AbortSignal) => Promise<T>, success: (value: T) => void) {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setPending(true); setError('');
    try {
      const result = await work(request.signal);
      if (active.current && !request.signal.aborted) success(result);
    } catch (caught) {
      if (active.current && !request.signal.aborted) { denied(caught); setError(errorMessage(caught)); }
    } finally {
      if (active.current && !request.signal.aborted) setPending(false);
      if (controller.current === request) controller.current = null;
    }
  }
  function cancel() { controller.current?.abort(); controller.current = null; setPending(false); }
  return { pending, error, run, cancel };
}
