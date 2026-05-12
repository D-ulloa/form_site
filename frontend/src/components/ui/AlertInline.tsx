import type { ReactNode } from 'react';

type Variant = 'error' | 'warning' | 'info' | 'success';

interface AlertInlineProps {
  variant?: Variant;
  title?: string;
  children: ReactNode;
}

const config: Record<Variant, { bg: string; border: string; icon: string; titleColor: string; textColor: string }> = {
  error: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    icon: 'text-red-400',
    titleColor: 'text-red-300',
    textColor: 'text-red-400/90',
  },
  warning: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: 'text-amber-400',
    titleColor: 'text-amber-300',
    textColor: 'text-amber-400/90',
  },
  info: {
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    icon: 'text-indigo-400',
    titleColor: 'text-indigo-300',
    textColor: 'text-indigo-400/90',
  },
  success: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: 'text-emerald-400',
    titleColor: 'text-emerald-300',
    textColor: 'text-emerald-400/90',
  },
};

const icons: Record<Variant, ReactNode> = {
  error: (
    <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.75 4.25a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5zm0 6a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8.22 1.754a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368L8.22 1.754zm-1.47 4.496a.75.75 0 0 1 1.5 0v3a.75.75 0 0 1-1.5 0v-3zM8 11a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM7.25 5.75a.75.75 0 0 1 1.5 0v4.5a.75.75 0 0 1-1.5 0v-4.5zm.75-2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
    </svg>
  ),
  success: (
    <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm3.78 5.78a.75.75 0 0 0-1.06-1.06L7 9.44 5.28 7.72a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25z" />
    </svg>
  ),
};

export function AlertInline({ variant = 'error', title, children }: AlertInlineProps) {
  const c = config[variant];
  return (
    <div
      className={`flex gap-3 rounded-lg border px-4 py-3 text-sm animate-fade-in ${c.bg} ${c.border}`}
      role="alert"
    >
      <span className={c.icon}>{icons[variant]}</span>
      <div className="flex flex-col gap-0.5">
        {title && <p className={`font-semibold ${c.titleColor}`}>{title}</p>}
        <div className={c.textColor}>{children}</div>
      </div>
    </div>
  );
}
