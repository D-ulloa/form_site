import type { PropertyForm } from '../hooks/usePropertyForm.ts';
import { Input } from '../../../components/ui/Input.tsx';
import { StepHeader } from '../../../components/ui/StepHeader.tsx';

interface Props {
  form: PropertyForm;
}

export function DistributionSection({ form }: Props) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <section id="section-distribution" className="surface rounded-2xl p-6 animate-fade-in-up delay-200">
      <StepHeader step={3} title="Distribución" subtitle="Dimensiones y ambientes de la propiedad" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Input
          label="Dormitorios"
          type="number"
          min={0}
          placeholder="0"
          error={errors.dormitorios?.message}
          {...register('dormitorios')}
        />
        <Input
          label="Baños"
          type="number"
          min={0}
          placeholder="0"
          error={errors.baños?.message}
          {...register('baños')}
        />
        <Input
          label="Medidas"
          placeholder="Ej: 80m²"
          error={errors.Medidas?.message}
          {...register('Medidas')}
        />
        <Input
          label="Cant. plantas"
          placeholder="Ej: 2"
          error={errors['Cantidad de plantas']?.message}
          {...register('Cantidad de plantas')}
        />
        <Input
          label="Cant. pisos (edificio)"
          type="number"
          min={0}
          placeholder="0"
          error={errors['Cantidad de pisos']?.message}
          {...register('Cantidad de pisos')}
        />
        <Input
          label="Nº departamento"
          placeholder="Ej: 4B"
          error={errors['Número del departamento']?.message}
          {...register('Número del departamento')}
        />
        <Input
          label="Deptos. por piso"
          type="number"
          min={0}
          placeholder="0"
          error={errors['Departamentos por piso']?.message}
          {...register('Departamentos por piso')}
        />
        <Input
          label="Piso de la unidad"
          placeholder="Ej: 4"
          error={errors['Número de piso de la unidad']?.message}
          {...register('Número de piso de la unidad')}
        />
        <Input
          label="Antigüedad (años)"
          type="number"
          min={0}
          placeholder="0"
          error={errors['Antigüedad en años']?.message}
          {...register('Antigüedad en años')}
        />
      </div>
    </section>
  );
}
