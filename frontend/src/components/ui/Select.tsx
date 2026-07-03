import { forwardRef, type SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, placeholder, error, className = '', id, required, ...props }, ref) => {
    const selectId = id ?? `select-${label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
    const errorId = `${selectId}-error`;
    const describedBy = [error ? errorId : undefined, props['aria-describedby']]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-sm font-medium text-slate-300">
          {label}
          {required && <span className="text-indigo-400 ml-0.5">*</span>}
        </label>
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            required={required}
            {...props}
            aria-invalid={error ? true : props['aria-invalid']}
            aria-describedby={describedBy}
            className={`field-input pr-9 cursor-pointer ${error ? 'is-error' : ''} ${className}`}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options
              .filter((opt) => !opt.disabled)
              .map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
          </select>
          {/* Custom chevron */}
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z" />
            </svg>
          </span>
        </div>
        {error && (
          <p id={errorId} className="text-xs text-red-400 flex items-center gap-1 mt-0.5">
            <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.75 4.25a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5zm0 6a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0z" />
            </svg>
            {error}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
