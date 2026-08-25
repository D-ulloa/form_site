import { useState } from 'react';
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertInline } from '../components/ui/AlertInline.tsx';
import { Button } from '../components/ui/Button.tsx';
import { ContractInspectionDetails } from '../features/contracts/components/ContractInspectionDetails.tsx';
import { ContractAdminRoleEditForm } from '../features/contracts/components/ContractAdminRoleEditForm.tsx';
import { fetchAdminSession } from '../features/contracts/services/adminAuthApi.ts';
import {
  archiveContractEntry,
  fetchContractAdminEntry,
  listContractEntries,
  regenerateContractToken,
  updateContractAdminEntryStatus,
} from '../features/contracts/services/contractApi.ts';
import { contractAdminPath } from '../features/contracts/services/contractIdentity.ts';
import { useOrganization } from '../app/contexts/OrganizationContext.tsx';
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
  const organization = useOrganization();
  const organizationSlug = organization.organization.slug;
  const { entryId: routeEntryId } = useParams<{ entryId?: string }>();
  const sessionQuery = useQuery({
    queryKey: ['contract-admin-session'],
    queryFn: fetchAdminSession,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const userId = sessionQuery.data?.user.id ?? '';
  const hasAdminIdentity = Boolean(sessionQuery.data);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const selectedId = routeEntryId ?? null;
  const detailsPanelRef = useRef<HTMLElement | null>(null);

  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateStatusMessage, setGenerateStatusMessage] = useState<string | null>(null);
  const [generatingEntryId, setGeneratingEntryId] = useState<string | null>(null);
  const [regeneratedUrl, setRegeneratedUrl] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<ContractRole | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'complete' | 'archived' | 'generar_contrato'>('all');

  const entriesQuery = useQuery({
    queryKey: ['contract-admin-entries', organization.organization.id, userId],
    queryFn: () => listContractEntries(organizationSlug, userId),
    enabled: hasAdminIdentity,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const detailQuery = useQuery({
    queryKey: ['contract-admin-entry', organization.organization.id, selectedId, userId],
    queryFn: () => fetchContractAdminEntry(organizationSlug, selectedId as string, userId),
    enabled: Boolean(selectedId && hasAdminIdentity),
    retry: false,
  });

  useEffect(() => {
    if (!selectedId) return;
    detailsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [entriesQuery.data, selectedId]);

  const archiveMutation = useMutation({
    mutationFn: (entryId: string) => archiveContractEntry(organizationSlug, entryId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract-admin-entries', organization.organization.id, userId] });
      if (selectedId) {
        void queryClient.invalidateQueries({ queryKey: ['contract-admin-entry', organization.organization.id, selectedId, userId] });
      }
    },
  });

  const tokenMutation = useMutation({
    mutationFn: ({ entryId, role }: { entryId: string; role: ContractRole }) =>
      regenerateContractToken(organizationSlug, entryId, role, userId),
    onSuccess: (result) => setRegeneratedUrl(result.url),
  });

  const generateContractMutation = useMutation({
    mutationFn: (entryId: string) => updateContractAdminEntryStatus(organizationSlug, entryId, 'generar_contrato', userId),
    onMutate: (entryId) => {
      setGenerateError(null);
      setGenerateStatusMessage(null);
      setGeneratingEntryId(entryId);
      return entryId;
    },
    onSuccess: () => {
      setGenerateError(null);
      setGenerateStatusMessage('Estado guardado. La entrega a Make está diferida por contención.');
      void queryClient.invalidateQueries({ queryKey: ['contract-admin-entries', organization.organization.id, userId] });
      if (selectedId) {
        void queryClient.invalidateQueries({ queryKey: ['contract-admin-entry', organization.organization.id, selectedId, userId] });
      }
    },
    onError: (error) => {
      setGenerateStatusMessage(null);
      if (!(error instanceof Error)) {
        setGenerateError('No se pudo actualizar el estado del contrato.');
        return;
      }
      const message = error.message || 'No se pudo iniciar la generación.';
      setGenerateError(message.includes('STATUS_VALUE_NOT_SUPPORTED') ? message : `No se pudo iniciar la generación. ${message}`);
    },
    onSettled: () => {
      setGeneratingEntryId(null);
      setTimeout(() => setGenerateStatusMessage(null), 3500);
    },
  });

  const filteredEntries = entriesQuery.data?.filter(
    (entry) => statusFilter === 'all' || entry.status === statusFilter,
  ) ?? [];

  if (sessionQuery.isPending || sessionQuery.isFetching) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-sm text-slate-400" role="status">
        Comprobando sesión…
      </main>
    );
  }

  if (!hasAdminIdentity) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-6">
        <AlertInline variant="warning" title="Sesión requerida">
          Iniciá sesión para abrir la administración.{' '}
          <Link to="/login" className="font-medium underline hover:text-white">
            Iniciar sesión
          </Link>
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
          <Link to={"/t/" + organizationSlug} className="text-sm text-slate-400 hover:text-white">Volver</Link>
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
          <div className="grid gap-6 lg:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)]">
            <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--bg-surface)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">Entradas</h2>
                  <p className="mt-1 text-xs text-slate-500">{filteredEntries.length} contratos</p>
                  {generateError && (
                    <div className="mt-2 px-5">
                      <AlertInline variant="error" title="No se pudo iniciar la generación">
                        {generateError}
                      </AlertInline>
                    </div>
                  )}
                  {generateStatusMessage && (
                    <div className="mt-2 px-5">
                      <AlertInline variant="success" title="Actualización guardada">
                        {generateStatusMessage}
                      </AlertInline>
                    </div>
                  )}
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
                        navigate(contractAdminPath(organizationSlug, entry.entryId));
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        setEditingRole(null);
                        setRegeneratedUrl(null);
                        navigate(contractAdminPath(organizationSlug, entry.entryId));
                      }}
                      aria-current={selectedId === entry.entryId ? 'page' : undefined}
                      className={
                        'grid w-full min-w-0 gap-2 px-5 py-4 text-left items-start transition-colors grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] ' +
                        (selectedId === entry.entryId ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]')
                      }
                    >
                      <div className="min-w-0">
                        <span className="block min-w-0 text-sm font-medium text-slate-200 truncate">
                          {entry.direccion || 'Sin dirección'}
                        </span>
                        <span className="mt-1 block min-w-0 truncate text-sm text-slate-300">
                          {getContractEntryWaitingStatus(entry)}
                        </span>
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
                          ? 'Guardando estado'
                          : 'Marcar para generación'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <aside
              ref={detailsPanelRef}
              data-contract-details-panel
              className="scroll-mt-24 rounded-xl border border-white/[0.08] bg-[var(--bg-surface)] p-5 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain"
            >
              {!selectedId && <p className="text-sm text-slate-500">Seleccioná una entrada para inspeccionarla.</p>}
              {detailQuery.isPending && selectedId && <p className="text-sm text-slate-400">Cargando detalle…</p>}
              {detailQuery.isError && (
                <AlertInline variant="error">No se pudo cargar el detalle.</AlertInline>
              )}
              {detailQuery.data && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-100">{detailQuery.data.entry.direccion || 'Sin dirección'}</h2>
                    </div>
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
                      organizationSlug={organizationSlug}
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
                        void queryClient.invalidateQueries({ queryKey: ['contract-admin-entries', organization.organization.id, userId] });
                        void queryClient.invalidateQueries({
                          queryKey: ['contract-admin-entry', organization.organization.id, selectedId, userId],
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
