import { useRef, useState } from 'react';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { Button } from '../../../components/ui/Button';
import { ArrangementDialog } from './ArrangementDialog';
import { useArrangementOperation } from '../hooks/useArrangementProperties';
import { CancellationReceipt, allowedMedia, describeRequestFiles, DraftReceipt, requestError, requestErrorCode, requestMutation, RequestRecord, UploadBatch, uploadRequestFile, validateRequestFiles } from '../services/arrangementRequestsApi';

export function ArrangementRequestForm({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: (id: string) => void }) {
  const { organization } = useOrganization();
  const operation = useArrangementOperation(requestError);
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [validation, setValidation] = useState('');
  const [progress, setProgress] = useState('');
  const attempt = useRef({ key: crypto.randomUUID(), uploadKey: crypto.randomUUID(), draftId: '', sessionId: '', started: false,
    descriptors: null as Awaited<ReturnType<typeof describeRequestFiles>> | null });
  const [locked, setLocked] = useState(false);
  async function ensureDraft(signal: AbortSignal) {
    const receipt = DraftReceipt.parse(await requestMutation(organization.id, '/inquilino/order-drafts', { description: description.trim() }, signal, attempt.current.key));
    signal.throwIfAborted(); attempt.current.draftId = receipt.id;
    if (receipt.upload_session_id) attempt.current.sessionId = receipt.upload_session_id;
    return receipt;
  }
  async function ensureBatch(signal: AbortSignal) {
    const current = attempt.current;
    current.descriptors ??= await describeRequestFiles(files, signal);
    signal.throwIfAborted();
    const batch = UploadBatch.parse(await requestMutation(organization.id, `/inquilino/order-drafts/${current.draftId}/assets/sessions`, { files: current.descriptors }, signal, current.uploadKey));
    signal.throwIfAborted(); current.sessionId = batch.upload_session_id;
    return batch;
  }
  async function abandon(signal: AbortSignal) {
    if (!attempt.current.started) return;
    let draft;
    try { draft = await ensureDraft(signal); }
    catch (caught) { if (requestErrorCode(caught) === 'DRAFT_EXPIRED') return; throw caught; }
    if (draft.submission_state === 'submitted') { onSubmitted(draft.id); return; }
    const cancellation = CancellationReceipt.parse(await requestMutation(organization.id,
      `/inquilino/order-drafts/${draft.id}/cancel`, {}, signal));
    if (cancellation.submission_state === 'submitted') onSubmitted(cancellation.id);
  }

  function close() {
    operation.cancel(); setProgress('Cancelando carga…');
    void operation.run(abandon, onClose);
  }
  function restart() {
    operation.cancel(); setProgress('Cancelando carga…');
    void operation.run(abandon, () => {
      attempt.current = { key: crypto.randomUUID(), uploadKey: crypto.randomUUID(), draftId: '', sessionId: '', started: false, descriptors: null };
      setLocked(false); setProgress('');
    });
  }
  return <ArrangementDialog title="Solicitud de arreglo" onClose={close}>
    <form className="flex min-w-0 flex-col gap-5" onSubmit={event => {
      event.preventDefault();
      if (!description.trim() || description.trim().length > 5000) { setValidation('Escribí una descripción de hasta 5000 caracteres.'); return; }
      const invalid = validateRequestFiles(files);
      if (invalid) { setValidation(invalid); return; }
      setValidation(''); setLocked(true); attempt.current.started = true;
      void operation.run(async signal => {
        setProgress('Preparando solicitud…');
        const draft = await ensureDraft(signal);
        if (draft.submission_state === 'submitted') return draft.id;
        if (files.length) {
          setProgress('Preparando archivos…');
          const batch = await ensureBatch(signal);
          if (batch.state !== 'consumed') {
            if (batch.uploads.length !== files.length) throw new Error('INVALID_RESPONSE');
            for (let index = 0; index < files.length; index++) {
              signal.throwIfAborted();
              await uploadRequestFile(files[index], batch.uploads[index], signal, percent => setProgress(`Subiendo archivo ${index + 1} de ${files.length}: ${percent}%`));
            }
            setProgress('Verificando archivos…');
            await requestMutation(organization.id, `/inquilino/order-drafts/${draft.id}/assets/sessions/${batch.upload_session_id}/finalize`, {}, signal);
          }
        }
        signal.throwIfAborted(); setProgress('Enviando solicitud…');
        const receipt = RequestRecord.parse(await requestMutation(organization.id, `/inquilino/order-drafts/${draft.id}/submit`, {}, signal));
        return receipt.id;
      }, onSubmitted);
    }}>
      <div className="flex flex-col gap-2"><label htmlFor="repair-description" className="text-sm font-medium">Descripción del arreglo</label>
        <textarea id="repair-description" required maxLength={5000} rows={6} value={description} disabled={locked || operation.pending}
          aria-describedby="description-limit" className="field-input min-h-36 resize-y" onChange={event => setDescription(event.target.value)} />
        <p id="description-limit" className="text-xs text-slate-400">Contanos qué necesita reparación. {description.length}/5000</p></div>
      <div className="flex min-w-0 flex-col gap-2"><label htmlFor="repair-files" className="text-sm font-medium">Imágenes y videos (opcional)</label>
        <input id="repair-files" type="file" multiple accept={allowedMedia.join(',')} disabled={locked || operation.pending}
          aria-describedby="file-limits" className="w-full min-w-0 rounded-lg border border-white/10 p-2 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-indigo-500/20 file:p-2 file:text-indigo-200"
          onChange={event => {
            const selected = [...files, ...Array.from(event.target.files ?? [])]; event.target.value = '';
            const invalid = validateRequestFiles(selected);
            if (invalid) { setValidation(invalid); return; }
            setFiles(selected); setValidation('');
          }} />
        <p id="file-limits" className="text-xs leading-5 text-slate-400">Hasta 30 imágenes de 10 MB y 10 videos de 100 MB. Máximo 1 GB en total. JPEG, PNG, WebP, MP4, WebM y QuickTime.</p>
        {files.length > 0 && <ul aria-label="Archivos seleccionados" className="space-y-2">
          {files.map((file, index) => <li key={`${index}-${file.name}`} className="flex min-w-0 items-center justify-between gap-2 text-sm">
            <span className="min-w-0 [overflow-wrap:anywhere]">{file.name}</span>
            <Button type="button" variant="ghost" size="sm" disabled={locked || operation.pending} aria-label={`Quitar ${file.name}`}
              onClick={() => setFiles(current => current.filter((_, position) => position !== index))}>Quitar</Button></li>)}
        </ul>}
      </div>
      {validation && <p role="alert" className="text-sm text-red-300">{validation}</p>}
      {operation.error && <p role="alert" className="text-sm text-red-300">{operation.error}</p>}
      {operation.pending && <p role="status" className="text-sm text-indigo-200">{progress || 'Cancelando carga…'}</p>}
      {locked && !operation.pending && <Button type="button" variant="ghost" onClick={restart}>Reiniciar carga y editar</Button>}
      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="ghost" onClick={close}>Cancelar</Button>
        <Button type="submit" disabled={operation.pending || !description.trim()}>{operation.error ? 'Reintentar envío' : 'Enviar solicitud'}</Button>
      </div>
    </form>
  </ArrangementDialog>;
}
