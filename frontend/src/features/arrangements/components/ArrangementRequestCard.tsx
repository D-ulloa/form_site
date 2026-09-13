import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { tenantQueryKey } from '../../../app/contexts/tenantState';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import type { ArrangementOrder } from '../types';
import { useArrangementOperation } from '../hooks/useArrangementProperties';
import { requestAssetView, requestError, statusOptions, updateRequestStatus } from '../services/arrangementRequestsApi';

export function ArrangementRequestCard({ order, tenant = false }: { order: ArrangementOrder; tenant?: boolean }) {
  const { organization, epoch, capabilities } = useOrganization();
  const client = useQueryClient();
  const operation = useArrangementOperation(requestError);
  const [status, setStatus] = useState(order.status);
  const writable = !tenant && capabilities.includes('arrangements.status.update');
  async function refresh() { await client.invalidateQueries({ queryKey: tenantQueryKey(organization.id, epoch, 'arrangements', 'orders') }); }
  return <article className="surface min-w-0 rounded-2xl p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="rounded-full bg-indigo-400/10 px-3 py-1 text-xs font-medium text-indigo-200">{statusOptions.find(option => option.value === order.status)?.label ?? order.status}</span>
      {tenant && order.created_by_you && <span className="text-xs text-slate-400">Tu solicitud</span>}
      <span className="text-xs text-slate-400">{order.submitted_at ? new Date(order.submitted_at).toLocaleString('es') : 'Registro histórico · fecha no disponible'}</span>
    </div>
    {!tenant && <div className="mt-4 text-sm text-slate-300 [overflow-wrap:anywhere]">
      <p className="font-medium">{order.property?.name ?? 'Propiedad no registrada'}</p>
      {order.property && <p className="mt-1 font-mono text-xs text-slate-500">{order.property.id}</p>}
    </div>}
    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-100 [overflow-wrap:anywhere]">{order.description ?? order.name}</p>
    <p className="mt-4 font-mono text-xs text-slate-500 [overflow-wrap:anywhere]">{order.id}</p>
    {!!order.assets?.length && <ul aria-label="Archivos adjuntos" className="mt-4 space-y-2">
      {order.assets.map(asset => <li key={asset.id} className="min-w-0">
        <Button variant="ghost" size="sm" className="max-w-full text-left [overflow-wrap:anywhere]" disabled={operation.pending}
          onClick={() => { void operation.run(async signal => {
            const link = await requestAssetView(organization.id, tenant, order.id, asset.id, signal);
            return link;
          }, link => {
            const anchor = document.createElement('a'); anchor.href = link.signed_url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
            anchor.click(); anchor.remove();
          }); }}>Descargar {asset.display_filename}</Button>
      </li>)}
    </ul>}
    {writable && <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={event => {
      event.preventDefault(); void operation.run(async signal => {
        try { return await updateRequestStatus(organization.id, order, status, signal); }
        finally { if (!signal.aborted) void refresh(); }
      }, () => {});
    }}>
      <div className="min-w-0 flex-1"><Select id={`status-${order.id}`} label="Estado de la solicitud" options={statusOptions} value={status}
        disabled={operation.pending} onChange={event => setStatus(event.target.value)} /></div>
      <Button type="submit" disabled={operation.pending || status === order.status}>Guardar estado</Button>
    </form>}
    {operation.error && <p role="alert" className="mt-3 text-sm text-red-300">{operation.error}</p>}
  </article>;
}
