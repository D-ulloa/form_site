import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import type { SubmissionResult, SubmissionStepResults } from '../features/properties/services/propertyApi.ts';
import { Button } from '../components/ui/Button.tsx';

type StepKey = keyof SubmissionStepResults;

const STEP_LABELS: Record<StepKey, string> = {
  drive_folder: 'Carpeta en Google Drive',
  file_upload: 'Carga de archivos',
  drive_upload: 'Subida a Drive',
  sheets: 'Fila en Google Sheets',
  make: 'Webhook a Make',
};

const STATUS_STYLE: Record<string, { label: string; dot: string; text: string }> = {
  ok:      { label: 'OK',        dot: 'bg-emerald-500', text: 'text-emerald-400' },
  failed:  { label: 'Error',     dot: 'bg-red-500',     text: 'text-red-400' },
  skipped: { label: 'Omitido',   dot: 'bg-slate-500',   text: 'text-slate-400' },
};

const OUTCOME_CONFIG = {
  success: {
    badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
    icon: '✓',
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-400',
    title: 'Propiedad enviada',
    subtitle: 'Todos los pasos completados correctamente.',
  },
  partial_failure: {
    badge: 'bg-violet-500/15 border-violet-500/30 text-violet-400',
    icon: '⚠',
    iconBg: 'bg-violet-500/15',
    iconColor: 'text-violet-400',
    title: 'Envío parcial',
    subtitle: 'Algunos pasos no se completaron. Revisá el detalle.',
  },
  failure: {
    badge: 'bg-red-500/15 border-red-500/30 text-red-400',
    icon: '✕',
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-400',
    title: 'Error en el envío',
    subtitle: 'El proceso no pudo completarse. Intentá nuevamente.',
  },
};

export function SubmissionSuccessPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const result = (location.state as { result: SubmissionResult } | null)?.result;

  // If no result in state (e.g., direct navigation), show minimal info
  if (!result) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="surface rounded-2xl p-10 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold text-slate-200 mb-2">Envío procesado</h1>
          <p className="text-slate-400 text-sm mb-6">ID: {submissionId}</p>
          <Button onClick={() => navigate('/')}>Volver al inicio</Button>
        </div>
      </div>
    );
  }

  const cfg = OUTCOME_CONFIG[result.outcome];

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="glass border-b border-white/[0.07] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link to="/" className="text-slate-400 hover:text-slate-200 transition-colors" aria-label="Inicio">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
            </svg>
          </Link>
          <h1 className="text-sm font-semibold text-slate-100">Resultado del envío</h1>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-10">
        {/* Outcome card */}
        <div className="surface rounded-2xl p-8 mb-6 animate-fade-in-up text-center">
          {/* Icon */}
          <div className={`w-16 h-16 ${cfg.iconBg} rounded-2xl flex items-center justify-center mx-auto mb-5 text-2xl ${cfg.iconColor}`}>
            {cfg.icon}
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-medium mb-4 ${cfg.badge}`}>
            {result.outcome === 'success' ? 'Éxito' : result.outcome === 'partial_failure' ? 'Parcial' : 'Fallido'}
          </span>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">{cfg.title}</h2>
          <p className="text-slate-400 text-sm">{cfg.subtitle}</p>

          {/* IDs */}
          <div className="mt-6 grid grid-cols-2 gap-3 text-left">
            <div className="surface-elevated rounded-xl px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">Property ID</p>
              <p className="text-sm font-mono text-slate-200 break-all">{result.property_id}</p>
            </div>
            <div className="surface-elevated rounded-xl px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">Submission ID</p>
              <p className="text-sm font-mono text-slate-200 break-all">{result.submission_id}</p>
            </div>
          </div>
        </div>

        {/* Drive folder link */}
        {result.drive_folder_url && (
          <div className="surface rounded-2xl p-6 mb-6 animate-fade-in-up delay-100">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Carpeta en Google Drive</h3>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4.439 14.836L7.17 9.877l2.731-4.958 2.732 4.958H4.438zm14.341 0l-2.731-4.959h-5.463l2.731 4.959h5.463zm-9.292 4.282L12.22 14.16h-5.463l-2.732 4.958h5.463zm7.34-4.282h-5.463l2.732 4.958h5.463L16.828 14.836z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 mb-0.5">{result.drive_folder_name}</p>
                <a
                  href={result.drive_folder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors truncate block"
                >
                  Abrir en Drive →
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Steps table */}
        <div className="surface rounded-2xl p-6 mb-6 animate-fade-in-up delay-200">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Detalle de pasos</h3>
          <div className="flex flex-col divide-y divide-white/[0.06]">
            {(Object.keys(STEP_LABELS) as StepKey[]).map((key) => {
              const status = result.steps[key];
              const s = STATUS_STYLE[status] ?? STATUS_STYLE.skipped;
              return (
                <div key={key} className="flex items-center justify-between py-3">
                  <span className="text-sm text-slate-300">{STEP_LABELS[key]}</span>
                  <span className={`flex items-center gap-2 text-xs font-medium ${s.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Error detail */}
        {result.error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 mb-6 animate-fade-in-up delay-200">
            <p className="text-sm font-medium text-red-300 mb-1">Detalle del error</p>
            <p className="text-sm text-red-400/80">{result.error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 animate-fade-in-up delay-300">
          <Button variant="primary" size="lg" onClick={() => navigate('/properties/new')} id="btn-add-another">
            Agregar otra propiedad
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate('/')}>
            Volver al inicio
          </Button>
        </div>
      </main>
    </div>
  );
}
