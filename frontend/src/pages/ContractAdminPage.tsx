import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAgent } from '../app/contexts/AgentContext.tsx';
import { AlertInline } from '../components/ui/AlertInline.tsx';
import { Button } from '../components/ui/Button.tsx';
import {
  archiveContractEntry,
  fetchContractAdminEntry,
  listContractEntries,
  regenerateContractToken,
} from '../features/contracts/services/contractApi.ts';
import {
  getContractEntryWaitingStatus,
  type ContractRole,
} from '../features/contracts/types.ts';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function ContractAdminPage() {
  const { agent } = useAgent();
  const userId = agent?.agent_user_id ?? '';
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [regeneratedUrl, setRegeneratedUrl] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'complete' | 'archived'>('all');
  const entriesQuery = useQuery({
    queryKey: ['contract-admin-entries', userId],
    queryFn: () => listContractEntries(userId),
    enabled: Boolean(userId),
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: ['contract-admin-entry', selectedId, userId],
    queryFn: () => fetchContractAdminEntry(selectedId as string, userId),
    enabled: Boolean(selectedId && userId),
    retry: false,
  });
  const archiveMutation = useMutation({
    mutationFn: (entryId: string) => archiveContractEntry(entryId, userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contract-admin-entries'] });
      if (selectedId) {
        await queryClient.invalidateQueries({ queryKey: ['contract-admin-entry', selectedId] });
      }
    },
  });
  const tokenMutation = useMutation({
    mutationFn: ({ entryId, role }: { entryId: string; role: ContractRole }) =>
      regenerateContractToken(entryId, role, userId),
    onSuccess: (result) => setRegeneratedUrl(result.url),
  });

  const filteredEntries = entriesQuery.data?.filter(
    (entry) => statusFilter === 'all' || entry.status === statusFilter,
  ) ?? [];

  if (!userId) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-6">
        <AlertInline variant="warning" title="Perfil requerido">
          Configurá tu agente desde la pantalla de inicio antes de abrir la administración.
        </AlertInline>
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="glass sticky top-0 z-10 border-b border-white/[0.07]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-cyan-400">Generación de contratos</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-100">Administrar contratos</h1>
          </div>
          <Link to="/" className="text-sm text-slate-400 hover:text-white">Volver</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {entriesQuery.isPending && <p className="text-sm text-slate-400" role="status">Cargando contratos…</p>}
        {entriesQuery.isError && (
          <AlertInline variant="error" title="No se pudo abrir la administración">
            Intentá nuevamente en unos instantes.
          </AlertInline>
        )}

        {entriesQuery.data && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--bg-surface)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">Entradas</h2>
                  <p className="mt-1 text-xs text-slate-500">{filteredEntries.length} contratos</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Estado
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                    className="rounded-lg border border-white/[0.1] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-slate-300"
                  >
                    <option value="all">Todos</option>
                    <option value="open">Abiertos</option>
                    <option value="complete">Completos</option>
                    <option value="archived">Archivados</option>
                  </select>
                </label>
              </div>
              {filteredEntries.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500">No hay contratos para este filtro.</p>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {filteredEntries.map((entry) => (
                    <button
                      key={entry.entryId}
                      type="button"
                      onClick={() => { setSelectedId(entry.entryId); setRegeneratedUrl(null); }}
                      className={`grid w-full gap-3 px-5 py-4 text-left transition-colors sm:grid-cols-[9rem_1fr_auto] ${
                        selectedId === entry.entryId ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className="font-mono text-sm text-slate-200">{entry.entryId.slice(0, 8)}</span>
                      <span>
                        <span className="block text-sm text-slate-300">{getContractEntryWaitingStatus(entry)}</span>
                        <span className="mt-1 block text-xs text-slate-600">{entry.createdBy}</span>
                      </span>
                      <time className="text-xs text-slate-500" dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <aside className="rounded-xl border border-white/[0.08] bg-[var(--bg-surface)] p-5 lg:sticky lg:top-24 lg:self-start">
              {!selectedId && <p className="text-sm text-slate-500">Seleccioná una entrada para inspeccionarla.</p>}
              {detailQuery.isPending && selectedId && <p className="text-sm text-slate-400">Cargando detalle…</p>}
              {detailQuery.isError && (
                <AlertInline variant="error">No se pudo cargar el detalle.</AlertInline>
              )}
              {detailQuery.data && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-mono text-sm text-slate-100">{detailQuery.data.entry.entryId}</h2>
                    <span className="text-xs text-cyan-400">
                      {getContractEntryWaitingStatus(detailQuery.data.entry)}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={detailQuery.data.entry.status === 'archived'}
                      loading={tokenMutation.isPending}
                      onClick={() => tokenMutation.mutate({ entryId: detailQuery.data.entry.entryId, role: 'user' })}
                    >
                      Regenerar enlace usuario
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={detailQuery.data.entry.status === 'archived'}
                      loading={tokenMutation.isPending}
                      onClick={() => tokenMutation.mutate({ entryId: detailQuery.data.entry.entryId, role: 'client' })}
                    >
                      Regenerar enlace cliente
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={detailQuery.data.entry.status === 'archived'}
                      loading={archiveMutation.isPending}
                      onClick={() => {
                        if (window.confirm('¿Archivar esta entrada y cerrar sus enlaces?')) {
                          archiveMutation.mutate(detailQuery.data.entry.entryId);
                        }
                      }}
                    >
                      Archivar entrada
                    </Button>
                  </div>

                  {regeneratedUrl && (
                    <div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] p-3">
                      <p className="text-xs text-cyan-300">Nuevo enlace (se muestra una sola vez)</p>
                      <p className="mt-2 break-all font-mono text-xs text-slate-300">{regeneratedUrl}</p>
                      <button
                        type="button"
                        className="mt-2 text-xs text-cyan-400 hover:text-cyan-300"
                        onClick={() => { void navigator.clipboard.writeText(regeneratedUrl); }}
                      >
                        Copiar enlace
                      </button>
                    </div>
                  )}

                  {(tokenMutation.isError || archiveMutation.isError) && (
                    <div className="mt-4">
                      <AlertInline variant="error">
                        No se pudo completar la acción. Intentá nuevamente.
                      </AlertInline>
                    </div>
                  )}

                  <details className="mt-5">
                    <summary className="cursor-pointer text-sm text-slate-300">Inspeccionar envíos</summary>
                    <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-black/20 p-3 text-xs leading-5 text-slate-400">
                      {JSON.stringify({
                        usuario: detailQuery.data.userSubmission,
                        cliente: detailQuery.data.clientSubmission,
                        combinado: detailQuery.data.combinedSubmission,
                      }, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
