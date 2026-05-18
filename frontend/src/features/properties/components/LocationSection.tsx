import type { PropertyForm } from '../hooks/usePropertyForm.ts';
import { Select } from '../../../components/ui/Select.tsx';
import { Input } from '../../../components/ui/Input.tsx';
import { StepHeader } from '../../../components/ui/StepHeader.tsx';
import { PAIS_OPTIONS, PROVINCIA_OPTIONS } from '../schemas/propertySchema.ts';

interface Props {
  form: PropertyForm;
}

const toOptions = (arr: readonly string[]) =>
  arr.map((value) => ({ value, label: value }));

export function LocationSection({ form }: Props) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <section id="section-location" className="surface rounded-2xl p-6 animate-fade-in-up delay-100">
      <StepHeader step={2} title="Ubicación" subtitle="País, provincia, localidad y barrio" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="País"
          placeholder="Seleccioná..."
          options={toOptions(PAIS_OPTIONS)}
          required
          error={errors.Pais?.message}
          {...register('Pais')}
        />
        <Select
          label="Provincia"
          placeholder="Seleccioná..."
          options={toOptions(PROVINCIA_OPTIONS)}
          required
          error={errors.Provincia?.message}
          {...register('Provincia')}
        />
        <Input
          label="Localidad"
          placeholder="Ej: Mar del Plata"
          hint="Completar manualmente"
          error={errors.Localidad?.message}
          {...register('Localidad')}
        />
        <Input
          label="Barrio"
          placeholder="Ej: Centro"
          hint="Completar manualmente"
          error={errors.Barrio?.message}
          {...register('Barrio')}
        />
        <Input
          label="Calle"
          placeholder="Ej: Av. Colón"
          required
          error={errors.Calle?.message}
          {...register('Calle')}
        />
        <Input
          label="Número"
          placeholder="Ej: 1234"
          error={errors['Número']?.message}
          {...register('Número')}
        />
        <Input
          label="Piso | Mza | Denominacion"
          placeholder="Ej: PB / Mza A"
          error={errors['Piso | Mza | Denominacion']?.message}
          {...register('Piso | Mza | Denominacion')}
        />
        <Input
          label="Depto | Lote |"
          placeholder="Ej: 4B"
          error={errors['Depto | Lote |']?.message}
          {...register('Depto | Lote |')}
        />
        <Input
          label="Referencia"
          placeholder="Indicaciones adicionales"
          error={errors.Referencia?.message}
          {...register('Referencia')}
        />
      </div>
    </section>
  );
}
