/* eslint-disable react-refresh/only-export-components */
import type {
  FieldError,
  RegisterOptions,
  UseFormRegister,
} from 'react-hook-form';
import { Checkbox } from '../../../components/ui/Checkbox.tsx';
import { Input } from '../../../components/ui/Input.tsx';
import { Select, type SelectOption } from '../../../components/ui/Select.tsx';
import type {
  ContractField,
  ContractFieldValue,
  ContractFormValues,
} from '../types.ts';

interface ContractFieldRendererProps {
  field: ContractField;
  register: UseFormRegister<ContractFormValues>;
  error?: FieldError;
  autoFocus?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

export function isValidContractDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getContractSelectOptions(field: ContractField): SelectOption[] {
  return (field.options ?? []).map((option) =>
    typeof option === 'string'
      ? { value: option, label: option }
      : { value: option.value, label: option.label },
  );
}

export function validateContractField(
  field: ContractField,
  value: unknown,
): true | string {
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') return `${field.label} debe ser verdadero o falso.`;
    return true;
  }

  if (isEmptyValue(value)) {
    return field.required ? `${field.label} es requerido.` : true;
  }

  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `${field.label} debe ser un número válido.`;
    }
    if (field.min !== undefined && value < field.min) {
      return `${field.label} debe ser mayor o igual a ${field.min}.`;
    }
    if (field.max !== undefined && value > field.max) {
      return `${field.label} debe ser menor o igual a ${field.max}.`;
    }
    return true;
  }

  if (typeof value !== 'string') return `${field.label} no es válido.`;

  const trimmedValue = value.trim();
  if (field.required && trimmedValue === '') return `${field.label} es requerido.`;
  if (!field.required && trimmedValue === '') return true;

  if (field.type === 'email' && !EMAIL_PATTERN.test(trimmedValue)) {
    return `${field.label} debe ser un correo válido.`;
  }

  if (field.type === 'date' && !isValidContractDate(trimmedValue)) {
    return `${field.label} debe ser una fecha válida.`;
  }

  if (field.type === 'select') {
    const allowedValues = getContractSelectOptions(field).map((option) => option.value);
    if (!allowedValues.includes(trimmedValue)) {
      return `${field.label} debe ser una de las opciones disponibles.`;
    }
  }

  if (field.maxLength !== undefined && trimmedValue.length > field.maxLength) {
    return `${field.label} no puede superar ${field.maxLength} caracteres.`;
  }

  if (field.pattern !== undefined) {
    try {
      if (!new RegExp(field.pattern).test(trimmedValue)) {
        return `${field.label} no tiene el formato esperado.`;
      }
    } catch {
      return `La regla de formato de ${field.label} no es válida.`;
    }
  }

  return true;
}

export function getContractFieldRules(
  field: ContractField,
): RegisterOptions<ContractFormValues> {
  return {
    validate: (value: ContractFieldValue) => validateContractField(field, value),
    ...(field.type === 'number'
      ? {
          setValueAs: (value: unknown) =>
            value === '' || value === undefined ? '' : Number(value),
        }
      : {}),
  };
}

export function ContractFieldRenderer({
  field,
  register,
  error,
  autoFocus = false,
}: ContractFieldRendererProps) {
  const inputId = `contract-${field.name}`;
  const errorId = `${inputId}-error`;
  const errorMessage = error?.message ? String(error.message) : undefined;
  const registration = register(field.name, getContractFieldRules(field));

  if (field.type === 'boolean') {
    return (
      <div className="flex flex-col gap-1.5" data-contract-field={field.name}>
        <div className="flex items-center gap-1">
          <Checkbox
            {...registration}
            id={inputId}
            label={field.label}
            aria-required={field.required}
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={errorMessage ? errorId : undefined}
            autoFocus={autoFocus}
          />
          {field.required && (
            <span className="text-indigo-400" aria-hidden="true">
              *
            </span>
          )}
        </div>
        {errorMessage && (
          <p id={errorId} className="text-xs text-red-400" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div data-contract-field={field.name}>
        <Select
          {...registration}
          id={inputId}
          label={field.label}
          options={getContractSelectOptions(field)}
          placeholder="Seleccioná una opción"
          required={field.required}
          error={errorMessage}
          autoFocus={autoFocus}
        />
      </div>
    );
  }

  return (
    <div data-contract-field={field.name}>
      <Input
        {...registration}
        id={inputId}
        label={field.label}
        type={field.type === 'string' ? 'text' : field.type}
        required={field.required}
        min={field.type === 'number' ? field.min : undefined}
        max={field.type === 'number' ? field.max : undefined}
        maxLength={field.maxLength}
        pattern={field.pattern}
        step={field.type === 'number' ? 'any' : undefined}
        inputMode={field.type === 'number' ? 'decimal' : undefined}
        autoComplete={field.type === 'email' ? 'email' : undefined}
        error={errorMessage}
        autoFocus={autoFocus}
      />
    </div>
  );
}
