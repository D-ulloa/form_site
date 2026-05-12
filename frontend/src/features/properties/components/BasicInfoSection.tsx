import type { PropertyForm } from '../hooks/usePropertyForm.ts';
import { Select } from '../../../components/ui/Select.tsx';
import { Input } from '../../../components/ui/Input.tsx';
import { StepHeader } from '../../../components/ui/StepHeader.tsx';
import {
  TIPO_PROPIEDAD_OPTIONS,
  OPERACION_OPTIONS,
  TIPO_CONTRATO_OPTIONS,
} from '../schemas/propertySchema.ts';

interface Props {
  form: PropertyForm;
}

const toOptions = (arr: readonly string[]) =>
  arr.map((v) => ({ value: v, label: v }));

export function BasicInfoSection({ form }: Props) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <section id="section-basic" className="surface rounded-2xl p-6 animate-fade-in-up">
      <StepHeader step={1} title="Identificación básica" subtitle="Tipo, operación y precio de la propiedad" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Tipo de propiedad"
          placeholder="Seleccioná..."
          options={toOptions(TIPO_PROPIEDAD_OPTIONS)}
          required
          error={errors.tipo_propiedad?.message}
          {...register('tipo_propiedad')}
        />
        <Select
          label="Operación"
          placeholder="Seleccioná..."
          options={toOptions(OPERACION_OPTIONS)}
          required
          error={errors.operación?.message}
          {...register('operación')}
        />
        <Select
          label="Tipo de contrato"
          placeholder="Seleccioná..."
          options={toOptions(TIPO_CONTRATO_OPTIONS)}
          required
          error={errors.tipo_contrato?.message}
          {...register('tipo_contrato')}
        />
        <Input
          label="Precio"
          type="number"
          min={0}
          step="any"
          required
          placeholder="0"
          error={errors.precio?.message}
          {...register('precio')}
        />
        <Input
          label="Expensas"
          type="number"
          min={0}
          step="any"
          placeholder="0"
          hint="Dejá en 0 si no aplica"
          error={errors.expensas?.message}
          {...register('expensas')}
        />
      </div>
    </section>
  );
}
