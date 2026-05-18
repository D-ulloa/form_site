import { StepHeader } from '../../../components/ui/StepHeader.tsx';

export function MultiSelectArraysSection() {
  return (
    <section id="section-lists" className="surface rounded-2xl p-6 animate-fade-in-up delay-400">
      <StepHeader step={6} title="Datos adicionales" subtitle="Los campos de servicios y comodidades ahora se capturan con nombres canónicos" />
      <p className="text-sm text-slate-400">
        Esta sección ya no envía campos de listas al backend. Los campos se sincronizan mediante propiedades canónicas en el schema.
      </p>
    </section>
  );
}
