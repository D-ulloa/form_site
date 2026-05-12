import { forwardRef, type InputHTMLAttributes } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', id, ...props }, ref) => {
    const checkId = id ?? `chk-${label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;

    return (
      <label
        htmlFor={checkId}
        className={`group flex items-center gap-3 cursor-pointer select-none ${className}`}
      >
        <div className="relative flex-shrink-0">
          <input
            ref={ref}
            id={checkId}
            type="checkbox"
            {...props}
            className="peer sr-only"
          />
          {/* Visual box */}
          <div className="w-5 h-5 rounded-md border border-white/[0.14] bg-[var(--bg-input)] transition-all duration-150 peer-checked:bg-indigo-600 peer-checked:border-indigo-600 group-hover:border-indigo-500/60 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/40">
            {/* Checkmark */}
            <svg
              className="absolute inset-0 m-auto w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-100 pointer-events-none"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 6l3 3 5-5" />
            </svg>
          </div>
        </div>
        <span className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors">
          {label}
        </span>
      </label>
    );
  },
);

Checkbox.displayName = 'Checkbox';
