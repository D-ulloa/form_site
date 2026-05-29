import { useController } from 'react-hook-form';
import type { PropertyForm } from '../hooks/usePropertyForm.ts';
import type { PropertyFormValues } from '../schemas/propertySchema.ts';
import { Select } from '../../../components/ui/Select.tsx';
import { Input } from '../../../components/ui/Input.tsx';
import { Checkbox } from '../../../components/ui/Checkbox.tsx';
import { StepHeader } from '../../../components/ui/StepHeader.tsx';
import { TIPO_PROPIEDAD_OPTIONS, OPERACION_OPTIONS, MONEDA_OPTIONS, TIPO_CONTRATO_OPTIONS } from '../schemas/propertySchema.ts';

interface Props {
  form: PropertyForm;
}

type SelectItemInput = string | { value: string; label: string; disabled?: boolean };

const toOptions = (arr: readonly SelectItemInput[]) =>
  arr.map((item) =>
    typeof item === 'string' ? { value: item, label: item } : item
  );

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
          error={errors['Tipo de Inmueble']?.message}
          {...register('Tipo de Inmueble')}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-300">Operación<span className="text-indigo-400 ml-0.5">*</span></span>
          <div className="grid grid-cols-2 gap-2">
            {OPERACION_OPTIONS.map((option) => (
              <label key={option} className="rounded-lg border border-white/[0.12] p-3 cursor-pointer transition-shadow hover:border-indigo-500/60">
                <input
                  type="radio"
                  value={option}
                  {...register('Operación')}
                  className="mr-2 align-middle"
                />
                <span className="text-sm text-slate-200">{option}</span>
              </label>
            ))}
          </div>
          {errors['Operación'] && (
            <p className="text-xs text-red-400">{errors['Operación']?.message}</p>
          )}
        </div>
        <Input
          label="Precio"
          type="number"
          min={0}
          step="any"
          required
          placeholder="0"
          error={errors.Precio?.message}
          {...register('Precio')}
        />
        <Input
          label="Expensas"
          type="number"
          min={0}
          step="any"
          placeholder="0"
          hint="Dejá en 0 si no aplica"
          error={errors.Expensas?.message}
          {...register('Expensas')}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-300">Moneda</span>
          <div className="grid grid-cols-2 gap-2">
            {MONEDA_OPTIONS.map((option) => (
              <label key={option} className="rounded-lg border border-white/[0.12] p-3 cursor-pointer transition-shadow hover:border-indigo-500/60">
                <input
                  type="radio"
                  value={option}
                  {...register('Moneda')}
                  className="mr-2 align-middle"
                />
                <span className="text-sm text-slate-200">{option}</span>
              </label>
            ))}
          </div>
          {errors.Moneda && (
            <p className="text-xs text-red-400">{errors.Moneda?.message}</p>
          )}
        </div>
        <Input
          label="Propietario"
          placeholder="Nombre del propietario"
          error={errors.Propietario?.message}
          {...register('Propietario')}
        />
        <Input
          label="Asesor comercial"
          placeholder="Nombre del asesor"
          error={errors['Asesor comercial']?.message}
          {...register('Asesor comercial')}
        />
        <Input
          label="Productor"
          placeholder="Nombre del productor"
          error={errors.Productor?.message}
          {...register('Productor')}
        />
        <Input
          label="Sucursal"
          placeholder="Nombre de la sucursal"
          error={errors.Sucursal?.message}
          {...register('Sucursal')}
        />
        <Select
          label="Tipo de contrato"
          placeholder="Seleccioná..."
          options={toOptions(TIPO_CONTRATO_OPTIONS)}
          error={errors['Tipo de contrato']?.message}
          {...register('Tipo de contrato')}
        />
      </div>

      <div className="mt-6">
        <p className="text-sm text-slate-400 mb-3">Opciones y banderas</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <BoolField form={form} fieldKey="Apto crédito" label="Apto crédito" />
          <BoolField form={form} fieldKey="Escritura" label="Escritura" />
          <BoolField form={form} fieldKey="Unidad en Pozo" label="Unidad en pozo" />
          <BoolField form={form} fieldKey="Cartel" label="Cartel" />
        </div>
      </div>
    </section>
  );
}
