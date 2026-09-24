import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { tenantQueryKey } from '../../../app/contexts/tenantState';
import { Button } from '../../../components/ui/Button';
import { useArrangementAccessError } from '../hooks/useArrangementProperties';
import { useArrangementChanges } from '../hooks/useArrangementChanges';
import { personalOrders } from '../services/arrangementAssignmentsApi';
import { ArrangementRequestCard } from './ArrangementRequestCard';
export function PersonalArrangements() {
  const { organization, membership, capabilities, epoch } = useOrganization();
  const denied = useArrangementAccessError(); const connection = useArrangementChanges();
  const query = useInfiniteQuery({ queryKey: tenantQueryKey(organization.id, epoch, 'arrangements', 'personal-orders', membership.id, 'personal'),
    enabled: capabilities.includes('personal.arrangements.read'), initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => personalOrders(organization.id, pageParam, signal), getNextPageParam: page => page.next_cursor,
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: true });
  useEffect(() => { if (query.error) denied(query.error); }, [denied, query.error]);
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  return <section className="mt-8 flex min-w-0 flex-col gap-5" aria-labelledby="personal-orders-title">
    <h2 id="personal-orders-title" className="text-xl font-semibold text-slate-100">Mis órdenes asignadas</h2>
    {connection === 'reconnecting' && <p role="status" className="text-sm text-amber-200">Reconectando actualizaciones…</p>}
    {query.isFetching && <p role="status">Cargando órdenes…</p>}
    {query.isError && <div role="alert"><p>{items.length ? 'No se pudo completar la lista.' : 'No se pudieron cargar las órdenes.'}</p>
      <Button variant="ghost" disabled={query.isFetching} onClick={() => { void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()); }}>Reintentar</Button></div>}
    {!query.isPending && !query.isError && !items.length && <p className="surface rounded-2xl p-6 text-sm text-slate-300">No tenés órdenes asignadas</p>}
    {!!items.length && <ul className="flex min-w-0 flex-col gap-4" aria-label="Órdenes asignadas">
      {items.map(order => <li key={`${order.id}:${order.version ?? 0}`}><ArrangementRequestCard order={order} audience="personal" /></li>)}
    </ul>}
    {query.hasNextPage && !query.isError && <Button variant="ghost" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>Cargar más</Button>}
  </section>;
}
