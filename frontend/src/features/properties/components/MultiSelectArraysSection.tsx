import { useController } from 'react-hook-form';
import type { PropertyForm } from '../hooks/usePropertyForm.ts';
import { MultiSelectChips } from '../../../components/ui/MultiSelectChips.tsx';
import { StepHeader } from '../../../components/ui/StepHeader.tsx';
import {
  SERVICIOS_OPTIONS,
  COMODIDADES_OPTIONS,
  ESPACIOS_COMUNES_OPTIONS,
  SEGURIDAD2_OPTIONS,
} from '../schemas/propertySchema.ts';

interface Props {
  form: PropertyForm;
}

type ArrayKey = 'Servicios' | 'Comodidades y equipamiento' | 'Espacios comunes' | 'Otros' | 'Seguridad_2';

function ArrayField({
  form,
  fieldKey,
  label,
  options,
  freeEntry,
}: {
  form: PropertyForm;
  fieldKey: ArrayKey;
  label: string;
  options?: string[];
  freeEntry?: boolean;
}) {
  const { field } = useController({ name: fieldKey, control: form.control });
  return (
    <MultiSelectChips
      label={label}
      value={field.value as string[]}
      onChange={field.onChange}
      options={options}
      freeEntry={freeEntry}
    />
  );
}

export function MultiSelectArraysSection({ form }: Props) {
  return (
    <section id="section-lists" className="surface rounded-2xl p-6 animate-fade-in-up delay-400">
      <StepHeader step={6} title="Servicios y comodidades" subtitle="Seleccioná o agregá los ítems que correspondan" />
      <div className="flex flex-col gap-6">
        <ArrayField form={form} fieldKey="Servicios" label="Servicios" options={SERVICIOS_OPTIONS} />
        <ArrayField form={form} fieldKey="Comodidades y equipamiento" label="Comodidades y equipamiento" options={COMODIDADES_OPTIONS} />
        <ArrayField form={form} fieldKey="Espacios comunes" label="Espacios comunes" options={ESPACIOS_COMUNES_OPTIONS} />
        <ArrayField form={form} fieldKey="Seguridad_2" label="Seguridad" options={SEGURIDAD2_OPTIONS} />
        <ArrayField form={form} fieldKey="Otros" label="Otros" freeEntry />
      </div>
    </section>
  );
}
