import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { AlertInline } from '../../../components/ui/AlertInline';
import { useArrangementOrders } from '../hooks/useArrangementOrders';

const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-400';
function statusLabel(status: string): string {
  return status === 'open' ? 'Abierta' : status === 'in_progress' ? 'En curso' : status;
}

export function ArrangementOrdersDashboard() {
  const [status, setStatus] = useState('');
  const [retainedStatuses, setRetainedStatuses] = useState<readonly string[]>([]);
  const query = useArrangementOrders(status);
  const availableStatuses = query.data?.pages.at(-1)?.available_statuses ?? retainedStatuses;
  const options = [...new Set([...availableStatuses, ...(status ? [status] : [])])];
  const orders = query.data?.pages.flatMap(page => page.items) ?? [];

  if (query.accessDenied) return <p role="status" className="text-sm text-slate-400">Validando acceso…</p>;

  return (
    <section aria-labelledby="arrangements-title" className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 id="arrangements-title" className="text-2xl font-semibold tracking-tight text-slate-100">Gestión de arreglos</h1>
        <p className="mt-2 text-sm text-slate-400">Órdenes abiertas</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 sm:w-60">
          <Select label="Filtrar por estado" value={status}
            options={[{ value: '', label: 'Todos' }, ...options.map(value => ({ value, label: statusLabel(value) }))]}
            onChange={event => { setRetainedStatuses(availableStatuses); setStatus(event.target.value); }} />
        </div>
        <Button type="button" variant="secondary" className={focusClass}>Generar propiedad</Button>
      </div>
      {query.isError && (
        <AlertInline title="No se pudieron cargar las órdenes">
          <p>{orders.length > 0
            ? 'La lista está incompleta o desactualizada. Volvé a intentar para cargar los resultados.'
            : 'Volvé a intentar en unos momentos.'}</p>
          <Button type="button" variant="ghost" size="sm" className={`mt-2 ${focusClass}`} disabled={query.isFetching}
            onClick={() => { void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()); }}>
            Reintentar
          </Button>
        </AlertInline>
      )}
      {query.isFetching && <p role="status" className="text-sm text-slate-400">Cargando órdenes…</p>}
      {!query.isPending && !query.isError && orders.length === 0 && (
        <p role="status" className="surface rounded-2xl px-6 py-10 text-center text-sm text-slate-400">
          {status ? 'No hay órdenes abiertas con este estado.' : 'No hay órdenes abiertas en esta organización.'}
        </p>
      )}
      {orders.length > 0 && (
        <ul aria-label="Órdenes abiertas" className="flex min-w-0 flex-col gap-3">
          {orders.map(order => (
            <li key={order.id} className="surface min-w-0 rounded-2xl p-5">
              <dl className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)_minmax(0,1fr)]">
                <div className="min-w-0"><dt className="text-xs text-slate-400">Nombre</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-100 [overflow-wrap:anywhere]">{order.name}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-slate-400">Estado</dt>
                  <dd className="mt-1 text-sm text-indigo-300 [overflow-wrap:anywhere]">{statusLabel(order.status)}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-slate-400">Identificador</dt>
                  <dd className="mt-1 font-mono text-xs text-slate-300 [overflow-wrap:anywhere]">{order.id}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && !query.isError && (
        <Button type="button" variant="ghost" className={`self-center ${focusClass}`} disabled={query.isFetching}
          onClick={() => { void query.fetchNextPage(); }}>Cargar más</Button>
      )}
    </section>
  );
}
