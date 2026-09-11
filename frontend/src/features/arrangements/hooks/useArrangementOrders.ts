import { useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { useAuthentication } from '../../../app/contexts/AuthenticationContext';
import { tenantQueryKey } from '../../../app/contexts/tenantState';
import { listArrangementOrders } from '../services/arrangementsApi';

export function useArrangementOrders(status: string) {
  const { organization, epoch } = useOrganization();
  const { refresh } = useAuthentication();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useInfiniteQuery({
    queryKey: tenantQueryKey(organization.id, epoch, 'arrangements', 'orders', { status, limit: 25 }),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listArrangementOrders({ organizationId: organization.id, status, cursor: pageParam, signal }),
    getNextPageParam: page => page.next_cursor,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const responseStatus = axios.isAxiosError(query.error) ? query.error.response?.status : undefined;
  const accessDenied = responseStatus !== undefined && [401, 403, 404].includes(responseStatus);

  useEffect(() => {
    if (!accessDenied) return;
    const queryKey = tenantQueryKey(organization.id, epoch, 'arrangements');
    void queryClient.cancelQueries({ queryKey }).then(() => queryClient.removeQueries({ queryKey }));
    if (responseStatus === 401) void refresh();
    navigate(responseStatus === 401 ? '/login' : '/', { replace: true });
  }, [accessDenied, responseStatus, organization.id, epoch, queryClient, refresh, navigate]);

  return { ...query, accessDenied };
}
