import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAgent } from '../app/contexts/AgentContext.tsx';
import { AlertInline } from '../components/ui/AlertInline.tsx';
import { Button } from '../components/ui/Button.tsx';
import { ContractInspectionDetails } from '../features/contracts/components/ContractInspectionDetails.tsx';
import { ContractAdminRoleEditForm } from '../features/contracts/components/ContractAdminRoleEditForm.tsx';
import {
  fetchAdminSession,
  getGoogleLoginUrl,
} from '../features/contracts/services/adminAuthApi.ts';
import {
  archiveContractEntry,
  fetchContractAdminEntry,
  listContractEntries,
  regenerateContractToken,
  updateContractAdminEntryStatus,
} from '../features/contracts/services/contractApi.ts';
import { contractAdminPath } from '../features/contracts/services/contractIdentity.ts';
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
  const { entryId: routeEntryId } = useParams<{ entryId?: string }>();
  const sessionQuery = useQuery({
    queryKey: ['contract-admin-session'],
    queryFn: fetchAdminSession,
    retry: false,
  });
  const userId = sessionQuery.data?.user.id
    ?? (import.meta.env.DEV ? agent?.agent_user_id : undefined)
    ?? '';
  const hasAdminIdentity = Boolean(userId || sessionQuery.data);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const selectedId = routeEntryId ?? null;

  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateStatusMessage, setGenerateStatusMessage] = useState<string | null>(null);
  const [generatingEntryId, setGeneratingEntryId] = useState<string | null>(null);
  const [regeneratedUrl, setRegeneratedUrl] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<ContractRole | null>(null);
<<<<<<< HEAD
  const [pendingGenerateId, setPendingGenerateId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null);
=======
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'complete' | 'archived' | 'generar_contrato'>('all');

>>>>>>> 77b1b97 (fix: restore contract admin list render and button mutation usage)
  const entriesQuery = useQuery({
    queryKey: ['contract-admin-entries', userId],
    queryFn: () => listContractEntries(userId),
    enabled: hasAdminIdentity,
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: ['contract-admin-entry', selectedId, userId],
    queryFn: () => fetchContractAdminEntry(selectedId as string, userId),
    enabled: Boolean(selectedId && hasAdminIdentity),
    retry: false,
  });

  const archiveMutation = useMutation({
    mutationFn: (entryId: string) => archiveContractEntry(entryId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract-admin-entries', userId] });
      if (selectedId) {
        void queryClient.invalidateQueries({ queryKey: ['contract-admin-entry', selectedId, userId] });
      }
    },
  });

  const tokenMutation = useMutation({
    mutationFn: ({ entryId, role }: { entryId: string; role: ContractRole }) =>
      regenerateContractToken(entryId, role, userId),
    onSuccess: (result) => setRegeneratedUrl(result.url),
  });

  const generateContractMutation = useMutation({
    mutationFn: (entryId: string) => updateContractAdminEntryStatus(entryId, 'generar_contrato', userId),
    onMutate: (entryId) => {
      setPendingGenerateId(entryId);
      setGenerateError(null);
      setGenerateSuccess(null);
      return undefined;
    },
<<<<<<< HEAD
    onSuccess: async (updatedEntry) => {
      await queryClient.invalidateQueries({ queryKey: ['contract-admin-entries', userId] });
      queryClient.setQueryData<readonly unknown[]>(
        ['contract-admin-entries', userId],
        (current) => {
          if (!Array.isArray(current)) return current;
          return current.map((entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            'entryId' in entry &&
            entry.entryId === updatedEntry.entryId
              ? { ...entry, ...(updatedEntry as object), status: updatedEntry.status }
              : entry,
          );
        },
      );
      if (selectedId) {
        await queryClient.invalidateQueries({ queryKey: ['contract-admin-entry', selectedId, userId] });
      }
      setGenerateSuccess("Estado actualizado correctamente");
    },
    onError: (error: unknown) => {
      const fallbackMessage =
        error instanceof Error
          ? error.message
          : error !== null && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string"
            ? (error as { message: string }).message
            : error !== null && typeof error === "object" && "error" in error && typeof (error as { error: unknown }).error === "string"
              ? `Error del backend: ${(error as { error: string }).error}`
              : "No se pudo iniciar la generaciÃ³n.";
      setGenerateError(fallbackMessage);
    },
    onSettled: () => {
      setPendingGenerateId(null);
=======
    onSuccess: () => {
      setGenerateError(null);
      setGenerateStatusMessage('Estado actualizado correctamente.');
      void queryClient.invalidateQueries({ queryKey: ['contract-admin-entries', userId] });
      if (selectedId) {
        void queryClient.invalidateQueries({ queryKey: ['contract-admin-entry', selectedId, userId] });
      }
    },
    onError: (error) => {
      setGenerateStatusMessage(null);
      if (!(error instanceof Error)) {
        setGenerateError('No se pudo actualizar el estado del contrato.');
        return;
      }
      const message = error.message || 'No se pudo iniciar la generaciÃ³n.';
      setGenerateError(message.includes('STATUS_VALUE_NOT_SUPPORTED') ? message : `No se pudo iniciar la generaciÃ³n. ${message}`);
>>>>>>> 77b1b97 (fix: restore contract admin list render and button mutation usage)
    },
    onSettled: () => {
      setGeneratingEntryId(null);
      setTimeout(() => setGenerateStatusMessage(null), 3500);
    },
  });

  const filteredEntries = entriesQuery.data?.filter(
    (entry) => statusFilter === 'all' || entry.status === statusFilter,
  ) ?? [];

  if (!hasAdminIdentity) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-6">
        <AlertInline variant="warning" title="Perfil requerido">
<<<<<<< HEAD
          IniciÃ¡ sesiÃ³n con Google para abrir la administraciÃ³n.{' '}
=======
          IniciÃ¡ sesiÃ³n con Google para abrir la administraciÃ³n.{''}
>>>>>>> 77b1b97 (fix: restore contract admin list render and button mutation usage)
          <a href={getGoogleLoginUrl()} className="font-medium underline hover:text-white">
            Iniciar sesiÃ³n con Google
          </a>
        </AlertInline>
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="glass sticky top-0 z-10 border-b border-white/[0.07]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-cyan-400">GeneraciÃ³n de contratos</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-100">Administrar contratos</h1>
          </div>
          <Link to="/" className="text-sm text-slate-400 hover:text-white">Volver</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {entriesQuery.isPending && <p className="text-sm text-slate-400" role="status">Cargando contratosâ€¦</p>}
        {entriesQuery.isError && (
          <AlertInline variant="error" title="No se pudo abrir la administraciÃ³n">
            IntentÃ¡ nuevamente en unos instantes.
          </AlertInline>
        )}

        {generateMutation.isError && (
          <AlertInline variant="error" title="No se pudo iniciar la generaciÃ³n">
            {generateError
              ?? (generateMutation.error instanceof Error
                ? generateMutation.error.message
                : "No se pudo iniciar la generaciÃ³n.")}
          </AlertInline>
        )}
        {generateSuccess && (
          <AlertInline variant="success" title="Contrato actualizado">
            {generateSuccess}
          </AlertInline>
        )}
        {entriesQuery.data && (
          <div className="grid gap-6 lg:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)]">
            <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--bg-surface)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">Entradas</h2>
                  <p className="mt-1 text-xs text-slate-500">{filteredEntries.length} contratos</p>
<<<<<<< HEAD
              {generateError && (
                <div className="mt-2 px-5">
                  <AlertInline
                    variant="error"
                    title="No se pudo iniciar la generaci?n"
                  >
                    {generateError}
                  </AlertInline>
                </div>
              )}
              {generateStatusMessage && (
                <div className="mt-2 px-5">
                  <AlertInline
                    variant="success"
                    title="ActualizaciÃ³n guardada"
                  >
                    {generateStatusMessage}
                  </AlertInline>
                </div>
              )}

=======
                  {generateError && (
                    <div className="mt-2 px-5">
                      <AlertInline variant="error" title="No se pudo iniciar la generaciÃ³n">
                        {generateError}
                      </AlertInline>
                    </div>
                  )}
                  {generateStatusMessage && (
                    <div className="mt-2 px-5">
                      <AlertInline variant="success" title="ActualizaciÃ³n guardada">
                        {generateStatusMessage}
                      </AlertInline>
                    </div>
                  )}
>>>>>>> 77b1b97 (fix: restore contract admin list render and button mutation usage)
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
                    <option value="generar_contrato">Generando contrato</option>
                    <option value="archived">Archivados</option>
                  </select>
                </label>
              </div>

              {filteredEntries.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500">No hay contratos para este filtro.</p>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {filteredEntries.map((entry) => (
                    <div
                      key={entry.entryId}
                      role="link"
                      tabIndex={0}
                      onClick={() => {
                        setEditingRole(null);
                        setRegeneratedUrl(null);
                        navigate(contractAdminPath(entry.entryId));
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        setEditingRole(null);
                        setRegeneratedUrl(null);
                        navigate(contractAdminPath(entry.entryId));
                      }}
                      aria-current={selectedId === entry.entryId ? 'page' : undefined}
                      className={
                        'grid w-full min-w-0 gap-2 px-5 py-4 text-left items-start transition-colors grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] ' +
                        (selectedId === entry.entryId ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]')
                      }
                    >
<<<<<<< HEAD
                      <Link
                        to={contractAdminPath(entry.entryId)}
                        onClick={() => { setEditingRole(null); setRegeneratedUrl(null); }}
                        aria-current={selectedId === entry.entryId ? 'page' : undefined}
                        className="text-left"
                      >
                        <span>
                          <span className="block text-sm font-medium text-slate-200">{entry.direccion || "Sin direcciÃ³n"}</span>
                        </span>
                        <span>
                          <span className="block text-sm text-slate-300">{getContractEntryWaitingStatus(entry)}</span>
                          <span className="mt-1 block text-xs text-slate-600">{entry.createdBy}</span>
                        </span>
                        <time className="text-xs text-slate-500" dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                      </Link>
                      <div className="sm:col-span-1 justify-self-end">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={entry.status === 'archived'}
                          loading={generateMutation.isPending && pendingGenerateId === entry.entryId}
                          onClick={() => {
                            generateMutation.mutate(entry.entryId);
                          }}
                        >
                          Generar contrato
                        </Button>
                      </div>
=======
                      <div className="min-w-0">
                        <span className="block min-w-0 text-sm font-medium text-slate-200 truncate">
                          {entry.direccion || 'Sin direcciÃ³n'}
                        </span>
                        <span className="mt-1 block min-w-0 truncate text-sm text-slate-300">
                          {getContractEntryWaitingStatus(entry)}
                        </span>
                        <span className="mt-1 block max-w-full truncate text-xs text-slate-600">{entry.createdBy}</span>
                        <time className="mt-1 block text-xs text-slate-500" dateTime={entry.createdAt}>
                          {formatDate(entry.createdAt)}
                        </time>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        loading={generateContractMutation.isPending && generatingEntryId === entry.entryId}
                        className="w-full md:w-auto justify-self-start md:justify-self-end whitespace-nowrap"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (entry.status === 'archived' || (generateContractMutation.isPending && generatingEntryId === entry.entryId)) {
                            return;
                          }
                          generateContractMutation.mutate(entry.entryId);
                        }}
                      >
                        {generateContractMutation.isPending && generatingEntryId === entry.entryId
                          ? 'Generando contrato'
                          : 'Generar contrato'}
                      </Button>
>>>>>>> 77b1b97 (fix: restore contract admin list render and button mutation usage)
                    </div>
                  ))}
                </div>
              )}
            </section>

            <aside className="rounded-xl border border-white/[0.08] bg-[var(--bg-surface)] p-5 lg:sticky lg:top-24 lg:self-start">
              {!selectedId && <p className="text-sm text-slate-500">SeleccionÃ¡ una entrada para inspeccionarla.</p>}
<<<<<<< HEAD
              {detailQuery.isPending && selectedId && <p className="text-sm text-slate-400">Cargando detalles...</p>}
=======
              {detailQuery.isPending && selectedId && <p className="text-sm text-slate-400">Cargando detalleâ€¦</p>}
>>>>>>> 77b1b97 (fix: restore contract admin list render and button mutation usage)
              {detailQuery.isError && (
                <AlertInline variant="error">No se pudo cargar el detalle.</AlertInline>
              )}
              {detailQuery.data && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
<<<<<<< HEAD
                      <h2 className="text-base font-semibold text-slate-100">{detailQuery.data.entry.direccion || "Sin direcciÃ³n"}</h2>
                      </div>
=======
                      <h2 className="text-base font-semibold text-slate-100">{detailQuery.data.entry.direccion || 'Sin direcciÃ³n'}</h2>
                    </div>
>>>>>>> 77b1b97 (fix: restore contract admin list render and button mutation usage)
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
                        if (window.confirm('Â¿Archivar esta entrada y cerrar sus enlaces?')) {
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
                        No se pudo completar la acciÃ³n. IntentÃ¡ nuevamente.
                      </AlertInline>
                    </div>
                  )}

                  {detailQuery.data.roleSchemas && (
                    <div className="mt-6 border-t border-white/[0.07] pt-5">
                      <h3 className="text-sm font-semibold text-slate-200">Editar datos enviados</h3>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {(['user', 'client'] as const).map((role) => {
                          const hasSubmission = role === 'user'
                            ? Boolean(detailQuery.data.userSubmission)
                            : Boolean(detailQuery.data.clientSubmission);
                          if (!hasSubmission) return null;
                          return (
                            <Button
                              key={role}
                              type="button"
                              variant={editingRole === role ? 'primary' : 'secondary'}
                              onClick={() => setEditingRole(role)}
                            >
                              Editar formulario del {role === 'user' ? 'usuario' : 'cliente'}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {editingRole && detailQuery.data.roleSchemas?.[editingRole] && (
                    <ContractAdminRoleEditForm
                      entryId={detailQuery.data.entry.entryId}
                      role={editingRole}
                      schema={detailQuery.data.roleSchemas[editingRole]}
                      values={(editingRole === 'user'
                        ? detailQuery.data.userSubmission
                        : detailQuery.data.clientSubmission) ?? {}}
                      userId={userId}
                      onCancel={() => setEditingRole(null)}
                      onSaved={() => {
                        setEditingRole(null);
                        void queryClient.invalidateQueries({ queryKey: ['contract-admin-entries', userId] });
                        void queryClient.invalidateQueries({
                          queryKey: ['contract-admin-entry', selectedId, userId],
                        });
                      }}
                    />
                  )}

                  <ContractInspectionDetails inspection={detailQuery.data.inspection} />
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
<<<<<<< HEAD










=======
>>>>>>> 77b1b97 (fix: restore contract admin list render and button mutation usage)
