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
        <div className="sm:col-span-2 flex flex-col gap-1.5">
          <label htmlFor="Observaciones" className="text-sm font-medium text-slate-300">Observaciones</label>
          <textarea
            id="Observaciones"
            rows={3}
            placeholder="Descripción libre, observaciones, etc."
            className="field-input resize-none"
            {...register('Observaciones')}
          />
        </div>

        <div className="sm:col-span-2 flex flex-col gap-1.5">
          <label htmlFor="Detalle" className="text-sm font-medium text-slate-300">Detalle</label>
          <textarea
            id="Detalle"
            rows={3}
            placeholder="Detalles técnicos, instalaciones, estados, etc."
            className="field-input resize-none"
            {...register('Detalle')}
          />
        </div>

        <Input label="Título" placeholder="Título para la publicación" required {...register('Titulo')} error={errors.Titulo?.message} />
        <Input label="Notas privadas" placeholder="Notas internas" {...register('Notas Privadas')} error={errors['Notas Privadas']?.message} />
        <Input label="Estado general" placeholder="Ej: Excelente" {...register('Estado general')} error={errors['Estado general']?.message} />
        <Input label="Apto para" placeholder="Ej: Vivienda / Oficina" {...register('Apto para')} error={errors['Apto para']?.message} />
        <Input label="Estilo" placeholder="Ej: Moderno" {...register('Estilo')} error={errors.Estilo?.message} />
        <Input label="Orientación" placeholder="Ej: Norte" {...register('Orientacion')} error={errors.Orientacion?.message} />
        <Input label="Referencia" placeholder="Punto de referencia" {...register('Referencia')} error={errors.Referencia?.message} />
      </div>
    </section>
  );
}
