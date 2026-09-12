import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { tenantQueryKey } from '../../../app/contexts/tenantState';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { AlertInline } from '../../../components/ui/AlertInline';
import { useArrangementCollection, useArrangementOperation } from '../hooks/useArrangementProperties';
import { createArrangementProperty, type ArrangementProperty } from '../services/arrangementPropertiesApi';
import { ArrangementDialog } from './ArrangementDialog';
import { ArrangementPropertyPanel } from './ArrangementPropertyPanel';

const schema = z.object({ name: z.string().trim().min(1, 'Ingresá un nombre.').max(200, 'Usá hasta 200 caracteres.') });

function CreatePropertyDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (property: ArrangementProperty) => void }) {
  const { organization } = useOrganization();
  const operation = useArrangementOperation();
  const attempt = useRef<{ name: string; key: string } | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { name: '' } });
  return <ArrangementDialog title="Generar propiedad" onClose={onClose}>
    <form noValidate onSubmit={event => { void handleSubmit(({ name }) => {
      if (!attempt.current || attempt.current.name !== name) attempt.current = { name, key: crypto.randomUUID() };
      const key = attempt.current.key;
      void operation.run(signal => createArrangementProperty(organization.id, name, key, signal), onCreated);
    })(event); }} className="grid gap-5">
      <Input label="Nombre de la propiedad" autoFocus required {...register('name')} error={errors.name?.message} disabled={operation.pending} />
      {operation.error && <AlertInline variant="error">{operation.error}</AlertInline>}
      <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" loading={operation.pending}>Crear propiedad</Button></div>
    </form>
  </ArrangementDialog>;
}

export function ArrangementPropertiesSection() {
  const { organization, epoch, capabilities } = useOrganization();
  const client = useQueryClient();
  const query = useArrangementCollection('properties');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ArrangementProperty | null>(null);
  const canCreate = capabilities.includes('arrangements.properties.create');
  const canManage = capabilities.includes('arrangements.inquilinos.manage') && capabilities.includes('members.read');
  const properties = query.data?.pages.flatMap(page => page.items) ?? [];
  function refresh() {
    void client.invalidateQueries({ queryKey: tenantQueryKey(organization.id, epoch, 'arrangements'),
      predicate: candidate => candidate.queryKey[4] !== 'orders' });
    void client.invalidateQueries({ queryKey: tenantQueryKey(organization.id, epoch, 'members') });
    void client.invalidateQueries({ queryKey: tenantQueryKey(organization.id, epoch, 'invitations') });
  }
  return <section aria-labelledby="arrangement-properties-title" className="mt-10 min-w-0 border-t border-white/10 pt-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="arrangement-properties-title" className="text-xl font-semibold">Propiedades</h2>
      {canCreate && <Button variant="secondary" onClick={() => setCreating(true)}>Generar propiedad</Button>}</div>
    {query.isPending && <p role="status" className="mt-4 text-sm text-slate-400">Cargando propiedades…</p>}
    {query.isError && <AlertInline title="No se pudieron cargar las propiedades"><Button variant="ghost" disabled={query.isFetching}
      onClick={() => { void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()); }}>Reintentar propiedades</Button></AlertInline>}
    {!query.isPending && !query.isError && properties.length === 0 && <p className="mt-4 text-sm text-slate-400">No hay propiedades en esta organización.</p>}
    {properties.length > 0 && <ul aria-label="Propiedades" className="mt-4 grid gap-3">
      {properties.map(property => <li key={property.id} className="surface min-w-0 rounded-xl p-5">
        <p className="font-medium [overflow-wrap:anywhere]">{property.name}</p>
        <p className="mt-1 font-mono text-xs text-slate-400 [overflow-wrap:anywhere]">{property.id}</p>
        {canManage && <Button variant="ghost" size="sm" className="mt-3" aria-label={`Agregar inquilino a ${property.name}`}
          onClick={() => setSelected(property)}>Agregar inquilino</Button>}
      </li>)}
    </ul>}
    {query.hasNextPage && <Button variant="ghost" className="mt-4" disabled={query.isFetching}
      onClick={() => { void query.fetchNextPage(); }}>Cargar más propiedades</Button>}
    {creating && canCreate && <CreatePropertyDialog onClose={() => setCreating(false)} onCreated={property => {
      setCreating(false); if (canManage) setSelected(property); refresh();
    }} />}
    {selected && canManage && <ArrangementPropertyPanel key={selected.id} property={selected} onClose={() => setSelected(null)} onChanged={refresh} />}
  </section>;
}
