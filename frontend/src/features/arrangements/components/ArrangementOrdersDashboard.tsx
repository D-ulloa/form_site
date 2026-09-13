import { useState } from 'react';
import { ArrangementPropertiesSection } from './ArrangementPropertiesSection';
import { ArrangementRequestCard } from './ArrangementRequestCard';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { AlertInline } from '../../../components/ui/AlertInline';
import { useArrangementOrders } from '../hooks/useArrangementOrders';
import { statusOptions } from '../services/arrangementRequestsApi';

export function ArrangementOrdersDashboard() {
  const [status, setStatus] = useState('');
  const query = useArrangementOrders(status);
  const orders = query.data?.pages.flatMap(page => page.items) ?? [];
  if (query.accessDenied) return <p role="status" className="text-sm text-slate-400">Validando acceso…</p>;
  return <section aria-labelledby="arrangements-title" className="flex min-w-0 flex-col gap-6">
    <div><h1 id="arrangements-title" className="text-2xl font-semibold tracking-tight text-slate-100">Gestión de arreglos</h1>
      <p className="mt-2 text-sm text-slate-400">Solicitudes de arreglo</p></div>
    <div className="min-w-0 sm:w-60"><Select label="Filtrar por estado" value={status}
      options={[{ value: '', label: 'Todos' }, ...statusOptions.map(option => option.value === 'archived' ? { ...option, label: 'Archivados' } : option)]}
      onChange={event => setStatus(event.target.value)} /></div>
    {query.isError && <AlertInline title="No se pudieron cargar las órdenes">
      <p>{orders.length ? 'La lista está incompleta o desactualizada. Volvé a intentar para cargar los resultados.' : 'Volvé a intentar en unos momentos.'}</p>
      <Button variant="ghost" size="sm" disabled={query.isFetching} onClick={() => { void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()); }}>Reintentar</Button>
    </AlertInline>}
    {query.isFetching && <p role="status" className="text-sm text-slate-400">Cargando órdenes…</p>}
    {!query.isPending && !query.isError && orders.length === 0 && <p role="status" className="surface rounded-2xl px-6 py-10 text-center text-sm text-slate-400">
      {status ? 'No hay solicitudes con este estado.' : 'No hay solicitudes en esta organización.'}</p>}
    {orders.length > 0 && <ul aria-label="Solicitudes de arreglo" className="flex min-w-0 flex-col gap-3">
      {orders.map(order => <li key={order.id}><ArrangementRequestCard order={order} /></li>)}</ul>}
    {query.hasNextPage && !query.isError && <Button variant="ghost" className="self-center" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>Cargar más</Button>}
    <ArrangementPropertiesSection />
  </section>;
}
