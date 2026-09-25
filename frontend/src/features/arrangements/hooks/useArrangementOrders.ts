import { useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { useAuthentication } from '../../../app/contexts/AuthenticationContext';
import { tenantQueryKey } from '../../../app/contexts/tenantState';
import { listArrangementOrders } from '../services/arrangementsApi';

export function useArrangementOrders(status: string, search: string | null = null) {
  const { organization, epoch, membership } = useOrganization();
  const { refresh } = useAuthentication();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canSearch = ['owner', 'admin', 'member'].includes(membership.role);
  const effectiveSearch = canSearch ? search : null;
  const queryKey = useMemo(() => tenantQueryKey(organization.id, epoch, 'arrangements', 'orders', membership.id, membership.role,
    { status, search: effectiveSearch, limit: 25 }), [organization.id, epoch, membership.id, membership.role, status, effectiveSearch]);
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listArrangementOrders({
      organizationId: organization.id, audience: membership.role === 'viewer' ? 'viewer' : 'manager',
      status, search: effectiveSearch, cursor: pageParam, signal,
    }),
    getNextPageParam: page => page.next_cursor,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const responseStatus = axios.isAxiosError(query.error) ? query.error.response?.status : undefined;
  const accessDenied = responseStatus !== undefined && [401, 403, 404].includes(responseStatus);
  const rawError = axios.isAxiosError(query.error) ? query.error.response?.data?.error : undefined;
  const errorCode = typeof rawError === 'object' && rawError !== null && 'code' in rawError ? rawError.code : undefined;
  const restartAttemptedFor = useRef<string | null>(null);
  const queryKeyFingerprint = JSON.stringify(queryKey);

  useEffect(() => {
    if (!query.isFetchNextPageError || errorCode !== 'INVALID_CURSOR' || restartAttemptedFor.current === queryKeyFingerprint) return;
    restartAttemptedFor.current = queryKeyFingerprint;
    void queryClient.resetQueries({ queryKey, exact: true });
  }, [errorCode, query.isFetchNextPageError, queryClient, queryKey, queryKeyFingerprint]);

  useEffect(() => {
    if (!accessDenied) return;
    const queryKey = tenantQueryKey(organization.id, epoch, 'arrangements');
    void queryClient.cancelQueries({ queryKey }).then(() => queryClient.removeQueries({ queryKey }));
    if (responseStatus === 401) void refresh();
    navigate(responseStatus === 401 ? '/login' : '/', { replace: true });
  }, [accessDenied, responseStatus, organization.id, epoch, queryClient, refresh, navigate]);

  return { ...query, accessDenied };
}
