import { ArrangementAssignmentControls } from './ArrangementAssignmentControls';
import type { ArrangementAudience, WorkReportRecord } from '../services/arrangementRequestsApi';
import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { tenantQueryKey } from '../../../app/contexts/tenantState';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import type { ArrangementOrder } from '../types';
import { useArrangementOperation } from '../hooks/useArrangementProperties';
import {
  acceptWorkReport, arrangementStatusLabel, normalizeWorkReport, requestAssetView, requestError,
  saveWorkReport, statusOptions, submitWorkReport, updateRequestStatus,
} from '../services/arrangementRequestsApi';

const MAX_REPORT = 10000;
function initialReportBody(report: WorkReportRecord | null) { return report?.status === 'draft' ? report.body : report?.body ?? ''; }
function initialSavedBody(report: WorkReportRecord | null) { return report?.status === 'draft' ? report.body : ''; }

export function ArrangementRequestCard({ order, audience }: { order: ArrangementOrder; audience: ArrangementAudience }) {
  const { organization, epoch, capabilities } = useOrganization();
  const client = useQueryClient();
  const operation = useArrangementOperation(requestError);
  const reportId = useId();
  const statusId = useId();
  const tenant = audience === 'tenant';
  const personal = audience === 'personal';
  const [status, setStatus] = useState(order.status);
  const report = normalizeWorkReport(order);
  const [reportBody, setReportBody] = useState(initialReportBody(report));
  const [savedBody, setSavedBody] = useState(initialSavedBody(report));
  const writable = audience === 'manager' && capabilities.includes('arrangements.status.update');
  const canReport = personal && capabilities.includes('personal.arrangements.report.write')
    && ['open', 'in_progress'].includes(order.status);
  const canAccept = tenant && capabilities.includes('inquilino.arrangements.accept')
    && order.status === 'solved' && report?.status === 'submitted';
  const trimmed = reportBody.trim();
  const dirty = trimmed !== savedBody;
  const lockedByReport = Boolean(report && report.status !== 'draft');
  async function refresh(list: 'orders' | 'personal-orders' | 'tenant-orders' = 'orders') {
    await client.invalidateQueries({ queryKey: tenantQueryKey(organization.id, epoch, 'arrangements', list) });
  }
  return <article className="surface min-w-0 rounded-2xl p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="rounded-full bg-indigo-400/10 px-3 py-1 text-xs font-medium text-indigo-200">{arrangementStatusLabel(order)}</span>
      {tenant && order.created_by_you && <span className="text-xs text-slate-400">Tu solicitud</span>}
      <span className="text-xs text-slate-400">{order.submitted_at ? new Date(order.submitted_at).toLocaleString('es') : 'Registro histórico · fecha no disponible'}</span>
    </div>
    {!tenant && <div className="mt-4 text-sm text-slate-300 [overflow-wrap:anywhere]">
      <p className="font-medium">{order.property?.name ?? 'Propiedad no registrada'}</p>
    </div>}
    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-100 [overflow-wrap:anywhere]">{order.description ?? order.name}</p>
    {!!order.assets?.length && <ul aria-label="Archivos adjuntos" className="mt-4 space-y-2">
      {order.assets.map(asset => <li key={asset.id} className="min-w-0">
        <Button variant="ghost" size="sm" className="max-w-full text-left [overflow-wrap:anywhere]" disabled={operation.pending}
          onClick={() => { void operation.run(async signal => {
            const link = await requestAssetView(organization.id, audience, order.id, asset.id, signal);
            return link;
          }, link => {
            const anchor = document.createElement('a'); anchor.href = link.signed_url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
            anchor.click(); anchor.remove();
          }); }}>Descargar {asset.display_filename}</Button>
      </li>)}
    </ul>}
    {report && report.status !== 'draft' && <section aria-label="Reporte de trabajo" className="mt-5 rounded-xl border border-slate-600/50 bg-slate-900/40 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Reporte de trabajo</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100 [overflow-wrap:anywhere]">{report.body}</p>
      <dl className="mt-3 grid gap-1 text-xs text-slate-400">
        {report.created_by?.name && <div><dt className="inline font-medium">Autor: </dt><dd className="inline">{report.created_by.name}</dd></div>}
        {report.submitted_at && <div><dt className="inline font-medium">Enviado: </dt><dd className="inline">{new Date(report.submitted_at).toLocaleString('es')}</dd></div>}
        {report.accepted_at && <div><dt className="inline font-medium">Aceptado: </dt><dd className="inline">{new Date(report.accepted_at).toLocaleString('es')}</dd></div>}
      </dl>
    </section>}
    {canReport && <form className="mt-5 flex flex-col gap-3" onSubmit={event => { event.preventDefault(); }} aria-label="Reporte de trabajo del personal">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={reportId} className="text-sm font-medium text-slate-300">Reporte de trabajo</label>
        <span className="text-xs text-slate-500" aria-live="polite">{trimmed.length} / {MAX_REPORT}</span>
      </div>
      <textarea id={reportId} name="work_report" rows={5} maxLength={MAX_REPORT} value={reportBody} disabled={operation.pending}
        className="field-input min-h-32 resize-y whitespace-pre-wrap" placeholder="Describí lo realizado en este arreglo"
        onChange={event => setReportBody(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" disabled={operation.pending || !trimmed || !dirty}
          onClick={() => { void operation.run(async signal => {
            const receipt = await saveWorkReport(organization.id, order, trimmed, signal);
            return receipt;
          }, receipt => {
            setSavedBody(receipt.work_report.body); setReportBody(receipt.work_report.body);
          }); }}>Guardar reporte</Button>
        <Button type="button" disabled={operation.pending || !trimmed || !savedBody || trimmed !== savedBody}
          onClick={() => {
            if (!window.confirm('¿Marcar el trabajo como terminado? El inquilino deberá aceptar el reporte para archivar la orden.')) return;
            void operation.run(async signal => {
              const receipt = await submitWorkReport(organization.id, order, report?.version ?? 1, signal);
              return receipt;
            }, () => { setReportBody(trimmed); setSavedBody(trimmed); void refresh('personal-orders'); });
          }}>Marcar trabajo como terminado</Button>
      </div>
    </form>}
    {canAccept && <div className="mt-5">
      <Button type="button" disabled={operation.pending}
        onClick={() => {
          if (!window.confirm('¿Aceptar la orden y el reporte? La solicitud quedará archivada.')) return;
          void operation.run(async signal => acceptWorkReport(organization.id, order, signal), () => {
            void refresh('tenant-orders'); void refresh('orders'); void refresh('personal-orders');
          });
        }}>Aceptar orden y reporte</Button>
    </div>}
    {writable && <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={event => {
      event.preventDefault(); void operation.run(async signal => {
        try { return await updateRequestStatus(organization.id, order, status, signal); }
        finally { if (!signal.aborted) void refresh(); }
      }, () => {});
    }}>
      <div className="min-w-0 flex-1"><Select id={statusId} label="Estado de la solicitud" options={statusOptions.filter(option => order.status === 'rejected' ? ['open', 'rejected'].includes(option.value) : option.value !== 'rejected')} value={status}
        disabled={operation.pending || lockedByReport} onChange={event => setStatus(event.target.value)} /></div>
      <Button type="submit" disabled={operation.pending || status === order.status || lockedByReport}>Guardar estado</Button>
    </form>}
    {(audience === 'manager' || audience === 'personal') && 'requester' in order && <dl aria-label="Contacto del solicitante" className="mt-5 grid gap-2 text-sm [overflow-wrap:anywhere]">
      <div><dt className="text-slate-400">Solicitante</dt><dd>{order.requester?.name ?? 'No disponible'}</dd></div>
      <div><dt className="text-slate-400">Correo</dt><dd>{order.requester?.email ?? 'No disponible'}</dd></div>
      <div><dt className="text-slate-400">Teléfono</dt><dd>{order.requester?.contact_number ?? 'No disponible'}</dd></div>
    </dl>}
    {audience === 'manager' && <ArrangementAssignmentControls order={order} />}
    {operation.error && <p role="alert" className="mt-3 text-sm text-red-300">{operation.error}</p>}
  </article>;
}
