// ─── Submission identity ────────────────────────────────────────────────────

export interface CreatedBy {
  user_id: string;
  name: string;
  email: string;
}

// ─── Property data (mirrors scheme.json exactly) ───────────────────────────

export interface PropertyData {
  tipo_propiedad: string;
  operación: string;
  dirección: string;
  barrio: string;
  zona: string;
  ciudad: string;
  dormitorios: number;
  baños: number;
  precio: number;
  expensas: number;
  info_relevante: string;
  Medidas: string;
  amoblado: boolean;
  barrio_cerrado: boolean;
  cochera: boolean;
  ascensor: boolean;
  patio: boolean;
  terraza: boolean;
  balcon: boolean;
  mascotas: boolean;
  Pileta: boolean;
  tipo_contrato: string;
  Instalaciones: string;
  Bauleras: string;
  Orientación: string;
  'Cantidad de plantas': string;
  'Cobertura de Cochera': string;
  'Propiedad Ocupada': boolean;
  'Apto para Escritura': boolean;
  'A estrenar': boolean;
  'Antigüedad en años': number;
  'Forma de pago': string;
  'Apto crédito': boolean;
  'Cantidad de pisos': number;
  'Número del departamento': string;
  'Departamentos por piso': number;
  'Número de piso de la unidad': string;
  Orientación_2: string;
  'Tipo de seguridad': string;
  Seguridad: string;
  'Conexión para lavarropas': boolean;
  Servicios: string[];
  'Comodidades y equipamiento': string[];
  'Espacios comunes': string[];
  Otros: string[];
  Seguridad_2: string[];
}

// ─── Media ──────────────────────────────────────────────────────────────────

export interface MediaFile {
  name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
}

export interface MediaInfo {
  total_size_bytes: number;
  cover_file_name: string;
  files: MediaFile[];
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

export interface SubmissionStepResults {
  drive_folder: SubmissionStepStatus;
  file_upload: SubmissionStepStatus;
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
  error?: string;
}
