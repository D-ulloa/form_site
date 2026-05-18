import { useController } from 'react-hook-form';
import type { PropertyForm } from '../hooks/usePropertyForm.ts';
import type { PropertyFormValues } from '../schemas/propertySchema.ts';
import { Checkbox } from '../../../components/ui/Checkbox.tsx';
import { StepHeader } from '../../../components/ui/StepHeader.tsx';

interface Props {
  form: PropertyForm;
}

const FEATURE_GROUPS: Array<{
  title: string;
  fields: { key: keyof PropertyFormValues; label: string }[];
}> = [
  {
    title: 'Espacios y ambientes',
    fields: [
      { key: 'Garage', label: 'Garage' },
      { key: 'Living Comedor', label: 'Living Comedor' },
      { key: 'Cocina Comedor', label: 'Cocina Comedor' },
      { key: 'Comedor diario', label: 'Comedor diario' },
      { key: 'Ante Cocina', label: 'Ante Cocina' },
      { key: 'Dependencias', label: 'Dependencias' },
      { key: 'Patio', label: 'Patio' },
      { key: 'Pileta', label: 'Pileta' },
      { key: 'Hogar', label: 'Hogar' },
      { key: 'Area de parrilla', label: 'Área de parrilla' },
      { key: 'Quincho', label: 'Quincho' },
      { key: 'Suite Principal', label: 'Suite Principal' },
      { key: 'Vestidor', label: 'Vestidor' },
      { key: 'Sala estar', label: 'Sala de estar' },
      { key: 'Estudio', label: 'Estudio' },
      { key: 'Escritorio', label: 'Escritorio' },
      { key: 'Lavadero', label: 'Lavadero' },
      { key: 'Hall acceso', label: 'Hall de acceso' },
      { key: 'Hall distrib.', label: 'Hall de distribución' },
    ],
  },
  {
    title: 'Instalaciones y servicios',
    fields: [
      { key: 'Gas Natural', label: 'Gas Natural' },
      { key: 'Gas en tubos', label: 'Gas en tubos' },
      { key: 'Cloacas', label: 'Cloacas' },
      { key: 'Calefactores', label: 'Calefactores' },
      { key: 'Calef. central', label: 'Calefacción central' },
      { key: 'Tiro balanc.', label: 'Tiro balanceado' },
      { key: 'Calefón', label: 'Calefón' },
      { key: 'Estractor', label: 'Extractor' },
      { key: 'Termotanque', label: 'Termotanque' },
      { key: 'Alarma', label: 'Alarma' },
      { key: 'Agua cte.', label: 'Agua corriente' },
      { key: 'Toillette', label: 'Toilette' },
      { key: 'Hidromasaje', label: 'Hidromasaje' },
      { key: 'Jacuzzi', label: 'Jacuzzi' },
      { key: 'Sotano', label: 'Sótano' },
    ],
  },
  {
    title: 'Extras y comodidades',
    fields: [
      { key: 'Bodega', label: 'Bodega' },
      { key: 'Despensa', label: 'Despensa' },
      { key: 'Play room', label: 'Play room' },
      { key: 'Bar', label: 'Bar' },
      { key: 'Jardín inv.', label: 'Jardín interno' },
      { key: 'Cámara Sept.', label: 'Cámara de seguridad' },
      { key: 'Galería', label: 'Galería' },
      { key: 'Altillo', label: 'Altillo' },
      { key: 'Terraza', label: 'Terraza' },
      { key: 'Aire A.Central', label: 'Aire acondicionado central' },
      { key: 'Aire A. Ind.', label: 'Aire acondicionado individual' },
      { key: 'Balcon', label: 'Balcón' },
    ],
  },
];

function BoolField({ form, fieldKey, label }: { form: PropertyForm; fieldKey: keyof PropertyFormValues; label: string }) {
  const { field } = useController({ name: fieldKey, control: form.control });
  return (
    <Checkbox
      label={label}
      checked={field.value as boolean}
      onChange={field.onChange}
    />
  );
}

export function FeaturesSection({ form }: Props) {
  return (
    <section id="section-features" className="surface rounded-2xl p-6 animate-fade-in-up delay-300">
      <StepHeader step={4} title="Características" subtitle="Marcá las características que apliquen" />
      <div className="space-y-6">
        {FEATURE_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="text-sm font-semibold text-slate-200 mb-3">{group.title}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.fields.map(({ key, label }) => (
                <BoolField key={key} form={form} fieldKey={key} label={label} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
