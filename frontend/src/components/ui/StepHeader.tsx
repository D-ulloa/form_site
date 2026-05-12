interface StepHeaderProps {
  step: number;
  title: string;
  subtitle?: string;
}

export function StepHeader({ step, title, subtitle }: StepHeaderProps) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
        <span className="text-sm font-bold text-indigo-400">{step}</span>
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
