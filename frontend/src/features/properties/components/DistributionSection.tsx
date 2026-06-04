import type { PropertyForm } from '../hooks/usePropertyForm.ts';
import { Select } from '../../../components/ui/Select.tsx';
import { Input } from '../../../components/ui/Input.tsx';
import { StepHeader } from '../../../components/ui/StepHeader.tsx';

interface Props {
  form: PropertyForm;
}

const rangeOptions = (max: number, start = 0) =>
  Array.from({ length: max - start + 1 }, (_, index) => {
    const value = start + index;
    return { value: String(value), label: String(value) };
  });

export function DistributionSection({ form }: Props) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <section id="section-distribution" className="surface rounded-2xl p-6 animate-fade-in-up delay-200">
      <StepHeader step={3} title="Distribución" subtitle="Dimensiones y ambientes de la propiedad" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Select
          label="Dormitorios"
          placeholder="Seleccioná..."
          options={rangeOptions(50, 0)}
          error={errors.Dormitorios?.message}
          {...register('Dormitorios')}
        />
        <Select
          label="Ambientes"
          placeholder="Seleccioná..."
          options={rangeOptions(50, 0)}
          error={errors.Ambientes?.message}
          {...register('Ambientes')}
        />
        <Select
          label="Baños"
          placeholder="Seleccioná..."
          options={rangeOptions(10, 0)}
          error={errors['Baños']?.message}
          {...register('Baños')}
        />
        <Select
          label="Plantas"
          placeholder="Seleccioná..."
          options={rangeOptions(10, 0)}
          error={errors.Plantas?.message}
          {...register('Plantas')}
        />
        <Select
          label="Antigüedad"
          placeholder="Seleccioná..."
          options={rangeOptions(50, 0)}
          error={errors.Antiguedad?.message}
          {...register('Antiguedad')}
        />
        <Input
          label="Metros cubiertos"
          placeholder="Ej: 80"
          error={errors['Metros cubiertos']?.message}
          {...register('Metros cubiertos')}
        />
        <Input
          label="Sup Terreno | Hectáreas"
          placeholder="Ej: 200"
          error={errors.SupTerrenoHectareas?.message}
          {...register('SupTerrenoHectareas')}
        />
        <Input
          label="Sup Terraza"
          placeholder="Ej: 10"
          error={errors['Sup Terraza']?.message}
          {...register('Sup Terraza')}
        />
        <Input
          label="Sup Balcón"
          placeholder="Ej: 5"
          error={errors['Sup Balcon']?.message}
          {...register('Sup Balcon')}
        />
        <Input
          label="Otras superficies"
          placeholder="Ej: 12"
          error={errors['Otras superficies']?.message}
          {...register('Otras superficies')}
        />
        <Input
          label="Sup de Jardín"
          placeholder="Ej: 50"
          error={errors['Sup de Jardin']?.message}
          {...register('Sup de Jardin')}
        />
        <Input
          label="Mts de Frente"
          placeholder="Ej: 10"
          error={errors['Mts de Frente']?.message}
          {...register('Mts de Frente')}
        />
        <Input
          label="Mts de Fondo"
          placeholder="Ej: 20"
          error={errors['Mts de Fondo']?.message}
          {...register('Mts de Fondo')}
        />
        <Input
          label="Llaves"
          placeholder="Ej: 2"
          error={errors.Llaves?.message}
          {...register('Llaves')}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Descrp. de dormitorio 1"
          placeholder="Ej: suite con placard"
          error={errors['Descrp. de dormitorio 1']?.message}
          {...register('Descrp. de dormitorio 1')}
        />
        <Input
          label="Descrp. de dormitorio 2"
          placeholder="Ej: doble"
          error={errors['Descrp. de dormitorio 2']?.message}
          {...register('Descrp. de dormitorio 2')}
        />
        <Input
          label="Descrp. de dormitorio 3"
          placeholder="Ej: individual"
          error={errors['Descrp. de dormitorio 3']?.message}
          {...register('Descrp. de dormitorio 3')}
        />
        <Input
          label="Descrp. de dormitorio 4"
          placeholder="Ej: escritorio"
          error={errors['Descrp. de dormitorio 4']?.message}
          {...register('Descrp. de dormitorio 4')}
        />
        <Input
          label="Descrp. de dormitorio 5"
          placeholder="Ej: habitación adicional"
          error={errors['Descrp. de dormitorio 5']?.message}
          {...register('Descrp. de dormitorio 5')}
        />
      </div>
    </section>
  );
}
