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

/**
 * Preprocessor for array fields that arrive as a JSON string
 * (multipart/form-data sends arrays as serialized JSON).
 */
function arrayFromForm(val: unknown): unknown {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed: unknown = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const formStringArray = z.preprocess(arrayFromForm, z.array(z.string()));

const PROPERTY_KEY_ALIASES: Record<string, string> = {
  operacion: 'operación',
  direccion: 'dirección',
  orientacion: 'Orientación',
  orientacion_2: 'Orientación_2',
  'Apto credito': 'Apto crédito',
  'Antiguedad en años': 'Antigüedad en años',
  'Conexion para lavarropas': 'Conexión para lavarropas',
  'operaciÃ³n': 'operación',
  'direcciÃ³n': 'dirección',
  'OrientaciÃ³n': 'Orientación',
  'OrientaciÃ³n_2': 'Orientación_2',
  'Apto crÃ©dito': 'Apto crédito',
  'AntigÃ¼edad en años': 'Antigüedad en años',
  'ConexiÃ³n para lavarropas': 'Conexión para lavarropas',
};

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

  return normalized;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export const propertySchema = z.object({
  // Agent / submitter info
  agent_user_id: z.string().min(1, 'agent_user_id is required'),
  agent_name: z.string().min(1, 'agent_name is required'),
  agent_email: z.email('agent_email must be a valid email'),

  // Cover image reference
  cover_file_name: z.string().default(''),

  // Identificación básica
  tipo_propiedad: z.string().min(1, 'tipo_propiedad es requerido'),
  operación: z.string().min(1, 'operación es requerida'),
  tipo_contrato: z.string().min(1, 'tipo_contrato es requerido'),
  precio: z.coerce.number().min(0),
  expensas: z.coerce.number().min(0).default(0),

  // Ubicación
  dirección: z.string().min(1, 'dirección es requerida'),
  barrio: z.string().min(1, 'barrio es requerido'),
  zona: z.string().min(1, 'zona es requerida'),
  ciudad: z.string().min(1, 'ciudad es requerida'),

  // Distribución
  dormitorios: z.coerce.number().int().min(0).default(0),
  baños: z.coerce.number().int().min(0).default(0),
  Medidas: z.string().default(''),
  'Cantidad de plantas': z.string().default(''),
  'Cantidad de pisos': z.coerce.number().int().min(0).default(0),
  'Número del departamento': z.string().default(''),
  'Departamentos por piso': z.coerce.number().int().min(0).default(0),
  'Número de piso de la unidad': z.string().default(''),
  'Antigüedad en años': z.coerce.number().int().min(0).default(0),

  // Características booleanas
  amoblado: formBool.default(false),
  barrio_cerrado: formBool.default(false),
  cochera: formBool.default(false),
  ascensor: formBool.default(false),
  patio: formBool.default(false),
  terraza: formBool.default(false),
  balcon: formBool.default(false),
  mascotas: formBool.default(false),
  Pileta: formBool.default(false),
  'Propiedad Ocupada': formBool.default(false),
  'Apto para Escritura': formBool.default(false),
  'A estrenar': formBool.default(false),
  'Apto crédito': formBool.default(false),
  'Conexión para lavarropas': formBool.default(false),

  // Detalles adicionales
  info_relevante: z.string().default(''),
  Instalaciones: z.string().default(''),
  Bauleras: z.string().default(''),
  Orientación: z.string().default(''),
  Orientación_2: z.string().default(''),
  'Cobertura de Cochera': z.string().default(''),
  'Forma de pago': z.string().default(''),
  'Tipo de seguridad': z.string().default(''),
  Seguridad: z.string().default(''),

  // Listas múltiples
  Servicios: formStringArray.default([]),
  'Comodidades y equipamiento': formStringArray.default([]),
  'Espacios comunes': formStringArray.default([]),
  Otros: formStringArray.default([]),
  Seguridad_2: formStringArray.default([]),
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
