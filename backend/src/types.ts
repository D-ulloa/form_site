// ─── Submission identity ────────────────────────────────────────────────────

export interface CreatedBy {
  user_id: string;
  name: string;
  email: string;
}

// ─── Property data (mirrors scheme_reworked.json exactly) ────────────────

export interface PropertyData {
  'Tipo de Inmueble': string;
  'Operación': string;
  Dormitorios: number;
  Ambientes: number;
  Precio: number;
  Expensas: number;
  Moneda: string;
  'Apto crédito': boolean;
  Escritura: boolean;
  'Unidad en Pozo': boolean;
  Cartel: boolean;
  'Barrio cerrado': boolean;
Amoblado: boolean;
  Ascensor: boolean;
  Mascotas: boolean;
  Propietario: string;
  'Asesor comercial': string;
  Productor: string;
  Sucursal: string;
  'Tipo de contrato': string;
  Pais: string;
  Provincia: string;
  Localidad: string;
  Barrio: string;
  Calle: string;
  'Número': string;
  'Piso | Mza | Denominacion': string;
  'Depto | Lote |': string;
  Referencia: string;
  'Baños': number;
  Plantas: number;
  Antiguedad: number;
  'Estado general': string;
  'Apto para': string;
  Estilo: string;
  Orientacion: string;
  'Sup Terreno | Hectáreas': string;
  'Sup Terraza': string;
  'Sup Balcon': string;
  'Otras superficies': string;
  'Metros cubiertos': string;
  'Sup de Jardin': string;
  'Mts de Frente': string;
  'Mts de Fondo': string;
  Llaves: string;
  'Descrp. de dormitorio 1': string;
  'Descrp. de dormitorio 2': string;
  'Descrp. de dormitorio 3': string;
  'Descrp. de dormitorio 4': string;
  'Descrp. de dormitorio 5': string;
  Garage: boolean;
  'Living Comedor': boolean;
  'Cocina Comedor': boolean;
  'Comedor diario': boolean;
  'Ante Cocina': boolean;
  Dependencias: boolean;
  Patio: boolean;
  Pileta: boolean;
  Hogar: boolean;
  'Area de parrilla': boolean;
  Quincho: boolean;
  'Suite Principal': boolean;
  Vestidor: boolean;
  'Sala estar': boolean;
  Estudio: boolean;
  Escritorio: boolean;
  Lavadero: boolean;
  'Hall acceso': boolean;
  'Hall distrib.': boolean;
  'Gas Natural': boolean;
  'Gas en tubos': boolean;
  Cloacas: boolean;
  Sotano: boolean;
  Bodega: boolean;
  Despensa: boolean;
  'Play room': boolean;
  Bar: boolean;
  'Jardín inv.': boolean;
  'Cámara Sept.': boolean;
  'Galería': boolean;
  Altillo: boolean;
  Terraza: boolean;
  'Aire A.Central': boolean;
  'Aire A. Ind.': boolean;
  Calefactores: boolean;
  'Calef. central': boolean;
  'Tiro balanc.': boolean;
  'Calefón': boolean;
  Estractor: boolean;
  Termotanque: boolean;
  Alarma: boolean;
  'Agua cte.': boolean;
  Toillette: boolean;
  Hidromasaje: boolean;
  Jacuzzi: boolean;
  Balcon: boolean;
  Observaciones: string;
  'Notas Privadas': string;
  Titulo: string;
  Detalle: string;
}

// ─── Media ──────────────────────────────────────────────────────────────────

export interface MediaFile {
  name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  storage_path?: string;
  storage_bucket?: string;
  public_path?: string;
  expires_at?: string;
}

export interface MediaInfo {
  total_size_bytes: number;
  cover_file_name: string;
  files: MediaFile[];
}

export interface MediaUploadMetadata {
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  storage_bucket?: string;
  public_path?: string;
  expires_at?: string;
}

// ─── Drive ──────────────────────────────────────────────────────────────────

export interface GoogleDriveInfo {
  folder_name: string;
  folder_url: string;
  parent_folder_id: string;
}

// ─── Make webhook payload (full contract from PRD) ──────────────────────────

export interface MakePayload {
  property_id: string;
  submission_id: string;
  created_at: string;
  created_by: CreatedBy;
  google_drive: GoogleDriveInfo;
  media: MediaInfo;
  property: PropertyData;
}

// ─── Submission result ───────────────────────────────────────────────────────

export type SubmissionStepStatus = 'ok' | 'failed' | 'skipped';
export type UploadStrategy = 'supabase' | 'drive' | 'both';

export interface SubmissionStepResults {
  drive_folder: SubmissionStepStatus;
  file_upload: SubmissionStepStatus;
  drive_upload: SubmissionStepStatus;
  sheets: SubmissionStepStatus;
  make: SubmissionStepStatus;
}

export type SubmissionOutcome = 'success' | 'failure' | 'partial_failure';

export interface SubmissionResult {
  outcome: SubmissionOutcome;
  property_id: string;
  submission_id: string;
  drive_folder_url?: string;
  drive_folder_name?: string;
  upload_strategy: UploadStrategy;
  supabase_object_count?: number;
  upload_byte_total?: number;
  steps: SubmissionStepResults;
  error?: string;
}

// ─── Persisted log ───────────────────────────────────────────────────────────

export interface SubmissionLog {
  property_id: string;
  submission_id: string;
  created_at: string;
  outcome: SubmissionOutcome;
  steps: SubmissionStepResults;
  drive_folder_name?: string;
  drive_folder_url?: string;
  upload_strategy?: UploadStrategy;
  supabase_object_count?: number;
  upload_byte_total?: number;
  error?: string;
}
