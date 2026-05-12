import { useState, useRef, type KeyboardEvent } from 'react';

interface MultiSelectChipsProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  options?: string[]; // predefined options; if absent → free entry
  freeEntry?: boolean;
  error?: string;
}

export function MultiSelectChips({
  label,
  value,
  onChange,
  options,
  freeEntry = false,
  error,
}: MultiSelectChipsProps) {
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = (item: string) => {
    if (value.includes(item)) {
      onChange(value.filter((v) => v !== item));
    } else {
      onChange([...value, item]);
    }
  };

  const addFreeEntry = () => {
    const trimmed = inputVal.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputVal('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addFreeEntry();
    }
    if (e.key === 'Backspace' && inputVal === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-300">{label}</span>

      {/* Predefined options */}
      {options && options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`chip ${value.includes(opt) ? 'chip-active' : ''}`}
            >
              {value.includes(opt) && (
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Free-entry section */}
      {(freeEntry || !options) && (
        <div
          className="flex flex-wrap gap-2 min-h-[42px] bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg p-2 cursor-text focus-within:border-indigo-500 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.18)] transition-all"
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((item) => (
            <span
              key={item}
              className="chip chip-active"
            >
              {item}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(item); }}
                className="ml-0.5 text-indigo-400 hover:text-red-400 transition-colors"
                aria-label={`Quitar ${item}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={addFreeEntry}
            placeholder={value.length === 0 ? 'Escribí y presioná Enter…' : ''}
            className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-slate-200 placeholder:text-[var(--text-muted)]"
          />
        </div>
      )}

      {/* Selected chips shown below predefined list */}
      {options && value.length > 0 && !freeEntry && (
        <div className="flex flex-wrap gap-1.5 mt-0.5">
          {value.map((item) => (
            <span key={item} className="chip chip-active text-xs">
              {item}
              <button
                type="button"
                onClick={() => toggle(item)}
                className="ml-0.5 text-indigo-400 hover:text-red-400 transition-colors"
                aria-label={`Quitar ${item}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.75 4.25a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5zm0 6a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
