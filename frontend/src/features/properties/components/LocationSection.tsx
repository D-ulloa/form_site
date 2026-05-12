import type { PropertyForm } from '../hooks/usePropertyForm.ts';
import { Input } from '../../../components/ui/Input.tsx';
import { StepHeader } from '../../../components/ui/StepHeader.tsx';

interface Props {
  form: PropertyForm;
}

export function LocationSection({ form }: Props) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <section id="section-location" className="surface rounded-2xl p-6 animate-fade-in-up delay-100">
      <StepHeader step={2} title="Ubicación" subtitle="Dirección, barrio, zona y ciudad" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Input
            label="Dirección"
            placeholder="Ej: Av. Colón 1234"
            required
            error={errors.dirección?.message}
            {...register('dirección')}
          />
        </div>
        <Input
          label="Barrio"
          placeholder="Ej: Centro"
          required
          error={errors.barrio?.message}
          {...register('barrio')}
        />
        <Input
          label="Zona"
          placeholder="Ej: Norte"
          required
          error={errors.zona?.message}
          {...register('zona')}
        />
        <div className="sm:col-span-2">
          <Input
            label="Ciudad"
            placeholder="Ej: Mar del Plata"
            required
            error={errors.ciudad?.message}
            {...register('ciudad')}
          />
        </div>
      </div>
    </section>
  );
}
