import { z } from 'zod';

// ─── Predefined options ───────────────────────────────────────────────────────

export const TIPO_PROPIEDAD_OPTIONS = [
  'Casa',
  'Departamento',
  'PH',
  'Local Comercial',
  'Oficina',
  'Terreno',
  'Galpon',
  'Cochera',
] as const;

export const OPERACION_OPTIONS = ['Venta', 'Alquiler', 'Alquiler temporario'] as const;
export const TIPO_CONTRATO_OPTIONS = ['Tradicional', 'Indexado', 'Dólares'] as const;

export const SERVICIOS_OPTIONS = [
  'Agua',
  'Gas natural',
  'Electricidad',
  'Cloacas',
  'Internet',
  'Cable',
  'Teléfono',
];

export const COMODIDADES_OPTIONS = [
  'Lavarropas',
  'Lavavajillas',
  'Heladera',
  'Microondas',
  'Horno',
  'Aire acondicionado',
  'Calefacción',
  'TV',
];

export const ESPACIOS_COMUNES_OPTIONS = [
  'Sum',
  'Quincho',
  'Gimnasio',
  'Lavadero',
  'Baulera',
  'Sala de juegos',
  'Coworking',
];

export const SEGURIDAD2_OPTIONS = [
  'Guardia 24hs',
  'Cámara',
  'Portero eléctrico',
  'Alarma',
  'Cerco eléctrico',
];

// ─── Schema ───────────────────────────────────────────────────────────────────

export const propertySchema = z.object({
  // Identificación básica
  tipo_propiedad: z.string().min(1, 'Seleccioná el tipo de propiedad'),
  operación: z.string().min(1, 'Seleccioná la operación'),
  tipo_contrato: z.string().min(1, 'Seleccioná el tipo de contrato'),
  precio: z.coerce.number().min(0, 'El precio debe ser mayor a 0'),
  expensas: z.coerce.number().min(0).default(0),

  // Ubicación
  dirección: z.string().min(1, 'La dirección es requerida'),
  barrio: z.string().min(1, 'El barrio es requerido'),
  zona: z.string().min(1, 'La zona es requerida'),
  ciudad: z.string().min(1, 'La ciudad es requerida'),

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
  amoblado: z.boolean().default(false),
  barrio_cerrado: z.boolean().default(false),
  cochera: z.boolean().default(false),
  ascensor: z.boolean().default(false),
  patio: z.boolean().default(false),
  terraza: z.boolean().default(false),
  balcon: z.boolean().default(false),
  mascotas: z.boolean().default(false),
  Pileta: z.boolean().default(false),
  'Propiedad Ocupada': z.boolean().default(false),
  'Apto para Escritura': z.boolean().default(false),
  'A estrenar': z.boolean().default(false),
  'Apto crédito': z.boolean().default(false),
  'Conexión para lavarropas': z.boolean().default(false),

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
  Servicios: z.array(z.string()).default([]),
  'Comodidades y equipamiento': z.array(z.string()).default([]),
  'Espacios comunes': z.array(z.string()).default([]),
  Otros: z.array(z.string()).default([]),
  Seguridad_2: z.array(z.string()).default([]),
});

export type PropertyFormValues = z.infer<typeof propertySchema>;
