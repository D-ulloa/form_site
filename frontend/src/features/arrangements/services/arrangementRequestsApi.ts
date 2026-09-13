import axios from 'axios';
import { z } from 'zod';
const prefix = import.meta.env.DEV ? '' : '/_/backend';
export const statusOptions = [
  { value: 'open', label: 'Sin procesar' }, { value: 'in_progress', label: 'En proceso' },
  { value: 'solved', label: 'Solucionado' }, { value: 'archived', label: 'Archivada' },
];
export const Status = z.enum(['open', 'in_progress', 'solved', 'archived']);
export const RequestRecord = z.object({
  id: z.uuid(), organization_id: z.uuid(), name: z.string().min(1).max(200), description: z.string().min(1).max(5000).nullable(), status: Status,
  property: z.object({ id: z.uuid(), name: z.string().min(1).max(200) }).strict().nullable(),
  created_at: z.string().nullable(), submitted_at: z.string().nullable(), updated_at: z.string().nullable(), version: z.number().int().positive(),
  legacy: z.boolean(), created_by_you: z.boolean(),
  assets: z.array(z.object({ id: z.uuid(), display_filename: z.string().min(1).max(120), mime: z.string(), bytes: z.number().int().positive() }).strict()).max(40),
}).strict();
export type ArrangementRequest = z.infer<typeof RequestRecord>;
export function requestBase(org: string) { return `${prefix}/api/organizations/${encodeURIComponent(org)}/arrangements`; }
function csrf() {
  const token = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('form_site_csrf='));
  return token ? { 'X-CSRF-Token': decodeURIComponent(token.slice('form_site_csrf='.length)) } : {};
}
export async function requestMutation(org: string, path: string, body: unknown, signal: AbortSignal, key?: string, method: 'post' | 'patch' = 'post'): Promise<unknown> {
  return (await axios[method](`${requestBase(org)}${path}`, body, { withCredentials: true, signal,
    headers: { ...csrf(), ...(key ? { 'Idempotency-Key': key } : {}) } })).data;
}
export async function tenantRequests(org: string, property: string, cursor: string | null, signal: AbortSignal) {
  const { data } = await axios.get(`${requestBase(org)}/inquilino/orders`, { withCredentials: true, signal, params: { limit: 25, ...(cursor ? { cursor } : {}) } });
  const page = z.object({ organization_id: z.literal(org), items: z.array(RequestRecord).max(100), available_statuses: z.array(Status), next_cursor: z.string().nullable() }).strict().parse(data);
  if (page.items.some(item => item.organization_id !== org || item.legacy || item.property?.id !== property)) throw new Error('INVALID_RESPONSE');
  return page;
}
export async function updateRequestStatus(org: string, order: { id: string; version?: number }, status: string, signal: AbortSignal) {
  return RequestRecord.parse(await requestMutation(org, `/orders/${order.id}/status`, { status, expected_version: order.version ?? 1 }, signal, undefined, 'patch'));
}
export async function requestAssetView(org: string, tenant: boolean, order: string, asset: string, signal: AbortSignal) {
  const { data } = await axios.get(`${requestBase(org)}${tenant ? '/inquilino' : ''}/orders/${order}/assets/${asset}/view`, { withCredentials: true, signal });
  const result = z.object({ signed_url: z.url(), expires_at: z.string() }).strict().parse(data);
  const url = new URL(result.signed_url);
  if (url.protocol !== 'https:' && !(import.meta.env.DEV && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('INVALID_RESPONSE');
  return result;
}
export function requestErrorCode(error: unknown): string | undefined {
  const raw = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
  return typeof raw === "string" ? raw : raw?.code;
}
export function requestError(error: unknown): string {
  const code = requestErrorCode(error);
  const messages: Record<string, string> = {
    VERSION_CONFLICT: 'Alguien actualizó esta solicitud. La lista se actualizará; revisá el estado antes de volver a guardar.',
    PROPERTY_REQUIRED: 'No tenés una propiedad vinculada. Contactá a la administración.',
    UPLOAD_INVALID: 'No se pudo verificar un archivo. Revisá su formato y volvé a intentar la carga.',
    UPLOAD_INCOMPLETE: 'Falta completar la carga de archivos. Volvé a intentar.',
    SESSION_INVALID: 'La carga venció. Usá Reiniciar carga para volver a subir los archivos.',
    DRAFT_EXPIRED: 'El borrador venció. Cerrá el formulario y creá una nueva solicitud.',
    QUOTA_EXCEEDED: 'No hay espacio disponible para estos archivos. Contactá a la administración.',
    RATE_LIMITED: 'Hubo demasiados intentos. Esperá unos momentos.',
    INVALID_REQUEST: 'Revisá la descripción y los archivos seleccionados.',
  };
  return (code ? messages[code] : undefined) ?? 'No se pudo completar la operación. Tus datos siguen en el formulario; volvé a intentar.';
}
export const allowedMedia = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
export function validateRequestFiles(files: readonly File[]): string | null {
  if (files.some(file => !allowedMedia.includes(file.type))) return 'Solo se permiten imágenes JPEG, PNG o WebP y videos MP4, WebM o QuickTime.';
  if (files.some(file => file.size < 1 || file.size > (file.type.startsWith('image/') ? 10 : 100) * 1024 ** 2)) return 'Cada imagen puede ocupar hasta 10 MB y cada video hasta 100 MB. No se permiten archivos vacíos.';
  if (files.length > 40 || files.filter(file => file.type.startsWith('image/')).length > 30 || files.filter(file => file.type.startsWith('video/')).length > 10) return 'Podés adjuntar hasta 30 imágenes y 10 videos.';
  if (files.reduce((total, file) => total + file.size, 0) > 1024 ** 3) return 'Los archivos no pueden superar 1 GB en total.';
  return null;
}
export async function describeRequestFiles(files: readonly File[], signal: AbortSignal) {
  const descriptors = [];
  for (const file of files) {
    signal.throwIfAborted();
    const checksum = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
    signal.throwIfAborted();
    descriptors.push({ receiver_key: file.type.startsWith('image/') ? 'arrangement.image' : 'arrangement.video', original_filename: file.name,
      declared_mime: file.type, declared_bytes: file.size, checksum_sha256: Array.from(checksum, n => n.toString(16).padStart(2, '0')).join('') });
  }
  return descriptors;
}
export const DraftReceipt = z.object({ id: z.uuid(), submission_state: z.enum(['draft', 'submitted']), status: Status, version: z.number().int().positive(), upload_session_id: z.uuid().nullable().optional() }).strict();
export const UploadBatch = z.object({ upload_session_id: z.uuid(), expires_at: z.string(), state: z.enum(['open', 'consumed']), version: z.number().int().positive(),
  uploads: z.array(z.object({ asset_id: z.uuid(), upload_intent_id: z.uuid(), upload_url: z.url(), required_headers: z.record(z.string(), z.string()) }).strict()).max(40) }).strict();
export async function uploadRequestFile(file: File, upload: z.infer<typeof UploadBatch>['uploads'][number], signal: AbortSignal, onProgress: (percent: number) => void) {
  // No cookies or application tokens are sent to Storage. An existing object is reconciled by finalize.
  await axios.put(upload.upload_url, file, { signal, withCredentials: false, headers: { ...upload.required_headers, 'Content-Type': file.type },
    onUploadProgress: event => { if (!signal.aborted) onProgress(Math.round((event.loaded / file.size) * 100)); },
    validateStatus: status => (status >= 200 && status < 300) || status === 409,
  });
}

export const CancellationReceipt = z.object({ id: z.uuid(), submission_state: z.enum(['expired', 'submitted']) }).strict();
