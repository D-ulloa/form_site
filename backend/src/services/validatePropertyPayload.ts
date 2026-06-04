import { z } from 'zod';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Preprocessor for boolean fields arriving as form-data strings.
 * "true" / "1" / "on" → true; everything else → false.
 */
function boolFromForm(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    return val === 'true' || val === '1' || val === 'on';
  }
  return false;
}

const formBool = z.preprocess(boolFromForm, z.boolean());

const PROPERTY_KEY_ALIASES: Record<string, string> = {
  tipo_propiedad: 'Tipo de Inmueble',
  operación: 'Operación',
  operacion: 'Operación',
  'operaciÃ³n': 'Operación',
  direccion: 'Calle',
  dirección: 'Calle',
  'direcciÃ³n': 'Calle',
  ciudad: 'Localidad',
  zona: 'Localidad',
  barrio: 'Barrio',
  dormitorios: 'Dormitorios',
  baños: 'Baños',
  banos: 'Baños',
  precio: 'Precio',
  expensas: 'Expensas',
  'Apto crédito': 'Apto crédito',
  'Apto credito': 'Apto crédito',
  'Apto para Escritura': 'Escritura',
  'Número del departamento': 'Depto | Lote |',
  'Número de piso de la unidad': 'Piso | Mza | Denominacion',
  Numero: 'Número',
  PisoMzaDenominacion: 'Piso | Mza | Denominacion',
  DeptoLote: 'Depto | Lote |',
  Medidas: 'Metros cubiertos',
  info_relevante: 'Observaciones',
  Instalaciones: 'Detalle',
  Bauleras: 'Detalle',
  'Antigüedad en años': 'Antiguedad',
  'Cantidad de plantas': 'Plantas',
  Orientación: 'Orientacion',
  'Orientación_2': 'Orientacion',
  'Conexión para lavarropas': 'Detalle',
  SupTerrenoHectareas: 'Sup Terreno | Hectáreas',
  tipo_contrato: 'Tipo de contrato',
  'tipo de contrato': 'Tipo de contrato',
  cochera: 'Garage',
  patio: 'Patio',
  terraza: 'Terraza',
  balcon: 'Balcon',
  Pileta: 'Pileta',
  'Apto crÃ©dito': 'Apto crédito',
  'AntigÃ¼edad en años': 'Antiguedad',
  'OrientaciÃ³n': 'Orientacion',
  'OrientaciÃ³n_2': 'Orientacion',
  'ConexiÃ³n para lavarropas': 'Detalle',
};

function normalizeFieldKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizePropertyPayload(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') {
    return raw;
  }

  const normalized = { ...(raw as Record<string, unknown>) };

  for (const [alias, canonical] of Object.entries(PROPERTY_KEY_ALIASES)) {
    if (!(canonical in normalized) && alias in normalized) {
      normalized[canonical] = normalized[alias];
    }
  }

  const normalizedKeyMap = new Map<string, string>();
  for (const canonical of Object.keys(propertySchema.shape)) {
    normalizedKeyMap.set(normalizeFieldKey(canonical), canonical);
  }
  for (const [alias, canonical] of Object.entries(PROPERTY_KEY_ALIASES)) {
    normalizedKeyMap.set(normalizeFieldKey(alias), canonical);
  }

  for (const key of Object.keys(raw as Record<string, unknown>)) {
    const canonical = normalizedKeyMap.get(normalizeFieldKey(key));
    if (canonical && !(canonical in normalized)) {
      normalized[canonical] = (raw as Record<string, unknown>)[key];
    }
  }

  return normalized;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export const propertySchema = z.object({
  // Agent / submitter info
  agent_user_id: z.string().min(1, 'agent_user_id is required'),
  agent_name: z.string().min(1, 'agent_name is required'),
  agent_email: z.string().email('agent_email must be a valid email'),

  // Cover image reference
  cover_file_name: z.string().default(''),

  // Property fields
  'Tipo de Inmueble': z.string().min(1, 'Tipo de Inmueble es requerido'),
  'Operación': z.string().min(1, 'Operación es requerido'),
  Dormitorios: z.coerce.number().int().min(0).default(0),
  Ambientes: z.coerce.number().int().min(0).default(0),
  Precio: z.coerce.number().min(0, 'Precio debe ser mayor o igual a 0'),
  Expensas: z.coerce.number().min(0).default(0),
  Moneda: z.string().default(''),
  'Apto crédito': formBool.default(false),
  Escritura: formBool.default(false),
  'Unidad en Pozo': formBool.default(false),
  Cartel: formBool.default(false),
  'Barrio cerrado': formBool.default(false),
Amoblado: formBool.default(false),
  Ascensor: formBool.default(false),
  Mascotas: formBool.default(false),
  Propietario: z.string().default(''),
  'Asesor comercial': z.string().default(''),
  Productor: z.string().default(''),
  Sucursal: z.string().default(''),
  'Tipo de contrato': z.enum([
    'A convenir.',
    '2 años con incremento cada 3 meses según el índice ICL.',
    '2 años con incremento cada 4 meses según el índice ICL.',
    '2 años con incremento cada 4 meses según el índice IPC.',
    '2 años con incremento cada 3 meses según el índice IPC.',
    '2 años con incremento cada 3 meses.',
    '2 años sin incrementos.',
    '24 meses con el índice IPC.',
    '1 año con incremento cada 3 meses según el índice ICL.',
    '1 año con incremento cada 3 meses según el indice IPC.',
    '1 año con incremento cada 4 meses según el indice IPC.',
  ]).or(z.literal('')).default(''),
  Pais: z.string().default('Argentina'),
  Provincia: z.string().default(''),
  Localidad: z.string().default(''),
  Barrio: z.string().default(''),
  Calle: z.string().min(1, 'Calle es requerido'),
  'Número': z.string().default(''),
  'Piso | Mza | Denominacion': z.string().default(''),
  'Depto | Lote |': z.string().default(''),
  Referencia: z.string().default(''),
  'Baños': z.coerce.number().int().min(0).default(0),
  Plantas: z.coerce.number().int().min(0).default(0),
  Antiguedad: z.coerce.number().int().min(0).default(0),
  'Estado general': z.string().default(''),
  'Apto para': z.string().default(''),
  Estilo: z.string().default(''),
  Orientacion: z.string().default(''),
  'Sup Terreno | Hectáreas': z.string().default(''),
  'Sup Terraza': z.string().default(''),
  'Sup Balcon': z.string().default(''),
  'Otras superficies': z.string().default(''),
  'Metros cubiertos': z.string().default(''),
  'Sup de Jardin': z.string().default(''),
  'Mts de Frente': z.string().default(''),
  'Mts de Fondo': z.string().default(''),
  Llaves: z.string().default(''),
  'Descrp. de dormitorio 1': z.string().default(''),
  'Descrp. de dormitorio 2': z.string().default(''),
  'Descrp. de dormitorio 3': z.string().default(''),
  'Descrp. de dormitorio 4': z.string().default(''),
  'Descrp. de dormitorio 5': z.string().default(''),
  Garage: formBool.default(false),
  'Living Comedor': formBool.default(false),
  'Cocina Comedor': formBool.default(false),
  'Comedor diario': formBool.default(false),
  'Ante Cocina': formBool.default(false),
  Dependencias: formBool.default(false),
  Patio: formBool.default(false),
  Pileta: formBool.default(false),
  Hogar: formBool.default(false),
  'Area de parrilla': formBool.default(false),
  Quincho: formBool.default(false),
  'Suite Principal': formBool.default(false),
  Vestidor: formBool.default(false),
  'Sala estar': formBool.default(false),
  Estudio: formBool.default(false),
  Escritorio: formBool.default(false),
  Lavadero: formBool.default(false),
  'Hall acceso': formBool.default(false),
  'Hall distrib.': formBool.default(false),
  'Gas Natural': formBool.default(false),
  'Gas en tubos': formBool.default(false),
  Cloacas: formBool.default(false),
  Sotano: formBool.default(false),
  Bodega: formBool.default(false),
  Despensa: formBool.default(false),
  'Play room': formBool.default(false),
  Bar: formBool.default(false),
  'Jardín inv.': formBool.default(false),
  'Cámara Sept.': formBool.default(false),
  'Galería': formBool.default(false),
  Altillo: formBool.default(false),
  Terraza: formBool.default(false),
  'Aire A.Central': formBool.default(false),
  'Aire A. Ind.': formBool.default(false),
  Calefactores: formBool.default(false),
  'Calef. central': formBool.default(false),
  'Tiro balanc.': formBool.default(false),
  'Calefón': formBool.default(false),
  Estractor: formBool.default(false),
  Termotanque: formBool.default(false),
  Alarma: formBool.default(false),
  'Agua cte.': formBool.default(false),
  Toillette: formBool.default(false),
  Hidromasaje: formBool.default(false),
  Jacuzzi: formBool.default(false),
  Balcon: formBool.default(false),
  Observaciones: z.string().default(''),
  'Notas Privadas': z.string().default(''),
  Titulo: z.string().min(1, 'Titulo es requerido'),
  Detalle: z.string().default(''),
});

export type ValidatedPropertyPayload = z.infer<typeof propertySchema>;

// ─── Validation function ──────────────────────────────────────────────────────

export type ValidationResult =
  | { success: true; data: ValidatedPropertyPayload }
  | { success: false; errors: string[] };

export function validatePropertyPayload(raw: unknown): ValidationResult {
  const normalized = normalizePropertyPayload(raw);
  const result = propertySchema.safeParse(normalized);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`,
  );
  return { success: false, errors };
}
