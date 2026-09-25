import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { useArrangementChanges } from '../hooks/useArrangementChanges';
import { useEffect, useRef, useState } from 'react';
import { ArrangementPropertiesSection } from './ArrangementPropertiesSection';
import { ArrangementRequestCard } from './ArrangementRequestCard';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { AlertInline } from '../../../components/ui/AlertInline';
import { useArrangementOrders } from '../hooks/useArrangementOrders';
import { statusOptions } from '../services/arrangementRequestsApi';
import { parseSearchInput } from '../utils/searchText';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_TOO_LONG_ERROR = 'Usá hasta 100 caracteres.';

export function ArrangementOrdersDashboard() {
  const { membership } = useOrganization();
  const connection = useArrangementChanges();
  const [status, setStatus] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [searchError, setSearchError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const canSearch = ['owner', 'admin', 'member'].includes(membership.role);
  const query = useArrangementOrders(status, canSearch ? search : null);
  const orders = query.data?.pages.flatMap(page => page.items) ?? [];
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);
  function scheduleSearch(value: string) {
    setDraftSearch(value);
    const parsed = parseSearchInput(value);
    setSearchError(parsed.error ? SEARCH_TOO_LONG_ERROR : '');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = undefined;
    if (parsed.error) return;
    debounceRef.current = setTimeout(() => { debounceRef.current = undefined; setSearch(parsed.value ?? ''); }, SEARCH_DEBOUNCE_MS);
  }
  function applySearch(value: string) {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = undefined; }
    setDraftSearch(value);
    const parsed = parseSearchInput(value);
    setSearchError(parsed.error ? SEARCH_TOO_LONG_ERROR : '');
    if (!parsed.error) setSearch(parsed.value ?? '');
  }
  if (query.accessDenied) return <p role="status" className="text-sm text-slate-400">Validando acceso…</p>;
  return <section aria-labelledby="arrangements-title" className="flex min-w-0 flex-col gap-6">
    <div><h1 id="arrangements-title" className="text-2xl font-semibold tracking-tight text-slate-100">Gestión de arreglos</h1>
      <p className="mt-2 text-sm text-slate-400">Solicitudes de arreglo</p></div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-end">
      <div className="min-w-0"><Select label="Filtrar por estado" value={status}
        options={[{ value: '', label: 'Todos' }, ...statusOptions.map(option => option.value === 'archived' ? { ...option, label: 'Archivados' } : option.value === 'rejected' ? { ...option, label: 'Rechazadas' } : option)]}
        onChange={event => setStatus(event.target.value)} /></div>
      {canSearch && <div className="flex min-w-0 items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-sm"><Input label="Buscar órdenes" type="search" value={draftSearch}
          placeholder="Nombre, descripción o propiedad" autoComplete="off" maxLength={100} hint="Máximo 100 caracteres."
          error={searchError} className="min-w-0"
          onChange={event => scheduleSearch(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applySearch(draftSearch); } }} /></div>
        <Button type="button" variant="ghost" aria-label="Limpiar búsqueda de órdenes" disabled={!draftSearch}
          onClick={() => applySearch('')}>Limpiar</Button>
      </div>}
    </div>
    {connection === 'reconnecting' && <p role="status" className="text-sm text-amber-200">Reconectando actualizaciones…</p>}
    {query.isError && <AlertInline title="No se pudieron cargar las órdenes">
      <p>{orders.length ? 'La lista está incompleta o desactualizada. Volvé a intentar para cargar los resultados.' : 'Volvé a intentar en unos momentos.'}</p>
      <Button variant="ghost" size="sm" disabled={query.isFetching} onClick={() => { void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()); }}>Reintentar</Button>
    </AlertInline>}
    {query.isFetching && <p role="status" className="text-sm text-slate-400">Cargando órdenes…</p>}
    {!query.isPending && !query.isError && orders.length === 0 && <p role="status" className="surface rounded-2xl px-6 py-10 text-center text-sm text-slate-400">
      {search ? 'No hay órdenes que coincidan con la búsqueda.'
        : status ? 'No hay solicitudes con este estado.' : 'No hay solicitudes en esta organización.'}</p>}
    {orders.length > 0 && <ul aria-label="Solicitudes de arreglo" className="flex min-w-0 flex-col gap-3">
      {orders.map(order => <li key={order.id}><ArrangementRequestCard key={`${order.id}:${order.version}`} order={order} audience={membership.role === 'viewer' ? 'viewer' : 'manager'} /></li>)}</ul>}
    {query.hasNextPage && !query.isError && <Button variant="ghost" className="self-center" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>Cargar más</Button>}
    <ArrangementPropertiesSection />
  </section>;
}
