import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { tenantQueryKey } from '../../../app/contexts/tenantState';
import { Button } from '../../../components/ui/Button';
import { useArrangementAccessError } from '../hooks/useArrangementProperties';
import { tenantRequests } from '../services/arrangementRequestsApi';
import { ArrangementRequestForm } from './ArrangementRequestForm';
import { ArrangementRequestCard } from './ArrangementRequestCard';

export function InquilinoArrangements() {
  const { organization, membership, epoch, capabilities } = useOrganization();
  const property = membership.arrangement_property_id ?? null;
  const denied = useArrangementAccessError();
  const client = useQueryClient();
  const [form, setForm] = useState(false);
  const [receipt, setReceipt] = useState('');
  const queryKey = tenantQueryKey(organization.id, epoch, 'arrangements', 'tenant-orders', membership.id, property);
  const query = useInfiniteQuery({ queryKey, initialPageParam: null as string | null,
    enabled: Boolean(property && capabilities.includes('inquilino.arrangements.read')),
    queryFn: ({ pageParam, signal }) => tenantRequests(organization.id, property!, pageParam, signal),
    getNextPageParam: page => page.next_cursor, retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false,
  });
  useEffect(() => { if (query.error) denied(query.error); }, [query.error, denied]);
  if (!property) return <p role="status" className="surface mt-8 rounded-2xl p-6 text-sm leading-6 text-slate-300">No tenés una propiedad vinculada. Contactá a la administración para poder enviar y consultar solicitudes.</p>;
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  return <section className="mt-8 flex min-w-0 flex-col gap-6" aria-label="Solicitudes de tu propiedad">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold text-slate-100">Solicitudes de tu propiedad</h2>
      <p className="mt-2 text-sm text-slate-400">Consultá el historial y el estado de los arreglos.</p></div>
      {capabilities.includes('inquilino.arrangements.create') && <Button onClick={() => { setReceipt(''); setForm(true); }}>Solicitud de arreglo</Button>}</div>
    {receipt && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200 [overflow-wrap:anywhere]">Solicitud enviada. Identificador: {receipt}</p>}
    {query.isFetching && <p role="status" className="text-sm text-slate-400">Cargando solicitudes…</p>}
    {query.isError && <div role="alert" className="text-sm text-red-300"><p>{items.length ? 'No se pudo completar el historial.' : 'No se pudieron cargar las solicitudes.'}</p>
      <Button variant="ghost" disabled={query.isFetching} onClick={() => { void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()); }}>Reintentar</Button></div>}
    {!query.isPending && !query.isError && !items.length && <p className="surface rounded-2xl p-6 text-sm text-slate-400">Todavía no hay solicitudes para esta propiedad.</p>}
    {!!items.length && <ul className="flex min-w-0 flex-col gap-4" aria-label="Historial de solicitudes">
      {items.map(order => <li key={order.id}><ArrangementRequestCard order={order} tenant /></li>)}</ul>}
    {query.hasNextPage && !query.isError && <Button variant="ghost" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>Cargar más</Button>}
    {form && <ArrangementRequestForm onClose={() => setForm(false)} onSubmitted={id => { setForm(false); setReceipt(id); void client.invalidateQueries({ queryKey }); }} />}
  </section>;
}
