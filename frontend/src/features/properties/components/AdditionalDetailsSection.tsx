import type { PropertyForm } from '../hooks/usePropertyForm.ts';
import { Input } from '../../../components/ui/Input.tsx';
import { StepHeader } from '../../../components/ui/StepHeader.tsx';

interface Props {
  form: PropertyForm;
}

export function AdditionalDetailsSection({ form }: Props) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <section id="section-details" className="surface rounded-2xl p-6 animate-fade-in-up delay-300">
      <StepHeader step={5} title="Detalles adicionales" subtitle="Información complementaria de la propiedad" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Full width — text areas */}
        <div className="sm:col-span-2 flex flex-col gap-1.5">
          <label htmlFor="info-relevante" className="text-sm font-medium text-slate-300">Info relevante</label>
          <textarea
            id="info-relevante"
            rows={3}
            placeholder="Descripción libre, observaciones, etc."
            className="field-input resize-none"
            {...register('info_relevante')}
          />
        </div>

        <Input label="Instalaciones" placeholder="Ej: Gas central, eléctrica" {...register('Instalaciones')} error={errors.Instalaciones?.message} />
        <Input label="Bauleras" placeholder="Ej: 1 baulera" {...register('Bauleras')} error={errors.Bauleras?.message} />
        <Input label="Orientación" placeholder="Ej: Norte" {...register('Orientación')} error={errors.Orientación?.message} />
        <Input label="Orientación 2" placeholder="Ej: Este" {...register('Orientación_2')} error={errors.Orientación_2?.message} />
        <Input label="Cobertura de cochera" placeholder="Ej: Techada" {...register('Cobertura de Cochera')} error={errors['Cobertura de Cochera']?.message} />
        <Input label="Forma de pago" placeholder="Ej: Efectivo, transferencia" {...register('Forma de pago')} error={errors['Forma de pago']?.message} />
        <Input label="Tipo de seguridad" placeholder="Ej: Privada" {...register('Tipo de seguridad')} error={errors['Tipo de seguridad']?.message} />
        <Input label="Seguridad" placeholder="Ej: Guardia 24hs" {...register('Seguridad')} error={errors.Seguridad?.message} />
      </div>
    </section>
  );
}
