import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { tenantQueryKey } from '../../../app/contexts/tenantState';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { ArrangementDialog } from './ArrangementDialog';
import { useArrangementOperation } from '../hooks/useArrangementProperties';
import { assignOrder, personalAssignees, rejectOrder, unassignOrder } from '../services/arrangementAssignmentsApi';
import { requestError } from '../services/arrangementRequestsApi';
import type { ArrangementOrder } from '../types';

function AssignmentPicker({ order, onClose, onChanged }: { order: ArrangementOrder; onClose: () => void; onChanged: () => void }) {
  const { organization, epoch, membership } = useOrganization();
  const [selected, setSelected] = useState(order.assignee?.available ? order.assignee.id : '');
  const operation = useArrangementOperation(requestError);
  const query = useInfiniteQuery({ queryKey: tenantQueryKey(organization.id, epoch, 'arrangements', 'assignees', membership.id),
    initialPageParam: null as string | null, queryFn: ({ pageParam, signal }) => personalAssignees(organization.id, pageParam, signal),
    getNextPageParam: page => page.next_cursor, retry: false, staleTime: 0, gcTime: 0 });
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  return <ArrangementDialog title={order.assignee ? 'Reasignar personal' : 'Asignar personal'} onClose={onClose}>
    <p className="mb-4 text-sm text-slate-300 [overflow-wrap:anywhere]">{order.name}</p>
    {query.isPending && <p role="status">Cargando personal…</p>}
    {query.isError && <div role="alert"><p>No se pudo completar la lista de personal.</p>
      <Button variant="ghost" onClick={() => { void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()); }}>Reintentar</Button></div>}
    {!query.isPending && !query.isError && !items.length && <p>No hay personal disponible. Incorporá personal mediante la invitación de Gestión de arreglos.</p>}
    {!!items.length && <form className="grid gap-4" onSubmit={event => {
      event.preventDefault(); void operation.run(async signal => {
        try { return await assignOrder(organization.id, order.id, order.version!, selected, signal); }
        catch (error) { if (!signal.aborted) { void query.refetch(); onChanged(); } throw error; }
      }, () => { onClose(); onChanged(); });
    }}>
      <Select label="Personal responsable" value={selected} disabled={operation.pending}
        options={[{ value: '', label: 'Elegí una persona' }, ...items.map(item => ({ value: item.id, label: `${item.name ?? 'No disponible'} · ${item.occupation ?? 'No disponible'}` }))]}
        onChange={event => setSelected(event.target.value)} />
      <Button type="submit" disabled={!selected || operation.pending}>Guardar asignación</Button>
    </form>}
    {query.hasNextPage && <Button variant="ghost" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>Cargar más personal</Button>}
    {operation.error && <p role="alert" className="mt-4 text-sm text-red-300">{operation.error} Cerrá este diálogo y revisá la orden antes de reintentar.</p>}
  </ArrangementDialog>;
}
export function ArrangementAssignmentControls({ order }: { order: ArrangementOrder }) {
  const { organization, epoch, capabilities } = useOrganization(); const client = useQueryClient();
  const [dialog, setDialog] = useState<'assign' | 'reject' | null>(null);
  const operation = useArrangementOperation(requestError);
  const changed = () => { void client.invalidateQueries({ queryKey: tenantQueryKey(organization.id, epoch, 'arrangements', 'orders') }); };
  const reconcileFailure = async <T,>(signal: AbortSignal, mutate: () => Promise<T>): Promise<T> => {
    try { return await mutate(); }
    catch (error) { if (!signal.aborted) changed(); throw error; }
  };
  const eligible = !order.legacy && !!order.property && !!order.version && ['open', 'in_progress'].includes(order.status);
  return <div className="mt-4">
    {order.assignee && <p className="mb-3 text-sm text-slate-300 [overflow-wrap:anywhere]">Responsable: {order.assignee.name ?? 'No disponible'} · {order.assignee.occupation ?? 'No disponible'}
      {!order.assignee.available && <strong className="ml-2 text-amber-200">No disponible</strong>}</p>}
    {eligible && <div className="flex flex-wrap gap-2">
      {capabilities.includes('arrangements.assignment.manage') && <>
        <Button variant="ghost" disabled={operation.pending} onClick={() => setDialog('assign')}>{order.assignee ? 'Reasignar personal' : 'Asignar personal'}</Button>
        {order.assignee && <Button variant="ghost" disabled={operation.pending} onClick={() => {
          void operation.run(signal => reconcileFailure(signal, () => unassignOrder(organization.id, order.id, order.version!, signal)), changed);
        }}>Quitar asignación</Button>}
      </>}
      {capabilities.includes('arrangements.request.reject') && <Button variant="ghost" disabled={operation.pending} onClick={() => setDialog('reject')}>Rechazar solicitud</Button>}
    </div>}
    {dialog === 'assign' && <AssignmentPicker order={order} onClose={() => setDialog(null)} onChanged={changed} />}
    {dialog === 'reject' && <ArrangementDialog title="Rechazar solicitud" onClose={() => { operation.cancel(); setDialog(null); }}>
      <p className="text-sm [overflow-wrap:anywhere]">Esta solicitud quedará Rechazada y se quitará su asignación. El inquilino verá el nuevo estado.</p>
      <Button className="mt-5" disabled={operation.pending} onClick={() => {
        void operation.run(signal => reconcileFailure(signal, () => rejectOrder(organization.id, order.id, order.version!, signal)), () => { setDialog(null); changed(); });
      }}>Confirmar rechazo</Button>
      {operation.error && <p role="alert" className="mt-3 text-sm text-red-300">{operation.error}</p>}
    </ArrangementDialog>}
    {operation.error && dialog !== 'reject' && <p role="alert" className="mt-3 text-sm text-red-300">{operation.error}</p>}
  </div>;
}
