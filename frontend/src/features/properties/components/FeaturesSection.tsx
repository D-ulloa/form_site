import { useController } from 'react-hook-form';
import type { PropertyForm } from '../hooks/usePropertyForm.ts';
import type { PropertyFormValues } from '../schemas/propertySchema.ts';
import { Checkbox } from '../../../components/ui/Checkbox.tsx';
import { StepHeader } from '../../../components/ui/StepHeader.tsx';

interface Props {
  form: PropertyForm;
}

const BOOLEAN_FIELDS: { key: keyof PropertyFormValues; label: string }[] = [
  { key: 'amoblado', label: 'Amoblado' },
  { key: 'barrio_cerrado', label: 'Barrio cerrado' },
  { key: 'cochera', label: 'Cochera' },
  { key: 'ascensor', label: 'Ascensor' },
  { key: 'patio', label: 'Patio' },
  { key: 'terraza', label: 'Terraza' },
  { key: 'balcon', label: 'Balcón' },
  { key: 'mascotas', label: 'Acepta mascotas' },
  { key: 'Pileta', label: 'Pileta' },
  { key: 'Propiedad Ocupada', label: 'Propiedad ocupada' },
  { key: 'Apto para Escritura', label: 'Apto para escritura' },
  { key: 'A estrenar', label: 'A estrenar' },
  { key: 'Apto crédito', label: 'Apto crédito' },
  { key: 'Conexión para lavarropas', label: 'Conexión para lavarropas' },
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        {BOOLEAN_FIELDS.map(({ key, label }) => (
          <BoolField key={key} form={form} fieldKey={key} label={label} />
        ))}
      </div>
    </section>
  );
}
