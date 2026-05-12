import type { PropertyFormValues } from '../schemas/propertySchema.ts';
import type { AgentData } from '../../../app/contexts/AgentContext.tsx';
import type { FileEntry } from '../../../components/ui/FileDropzone.tsx';

/**
 * Maps form values + files + agent identity → multipart/form-data.
 * The backend reads property fields as text fields and files[] as uploaded files.
 * Array fields are serialized as JSON strings (backend's arrayFromForm preprocessor handles this).
 * Boolean fields are sent as "true"/"false" strings.
 */
export function buildFormData(
  values: PropertyFormValues,
  files: FileEntry[],
  coverFileName: string,
  agent: AgentData,
): FormData {
  const fd = new FormData();

  // Agent fields
  fd.append('agent_user_id', agent.agent_user_id);
  fd.append('agent_name', agent.agent_name);
  fd.append('agent_email', agent.agent_email);

  // Cover file reference
  fd.append('cover_file_name', coverFileName);

  // Property fields
  const ARRAY_KEYS: (keyof PropertyFormValues)[] = [
    'Servicios',
    'Comodidades y equipamiento',
    'Espacios comunes',
    'Otros',
    'Seguridad_2',
  ];

  const BOOL_KEYS: (keyof PropertyFormValues)[] = [
    'amoblado',
    'barrio_cerrado',
    'cochera',
    'ascensor',
    'patio',
    'terraza',
    'balcon',
    'mascotas',
    'Pileta',
    'Propiedad Ocupada',
    'Apto para Escritura',
    'A estrenar',
    'Apto crédito',
    'Conexión para lavarropas',
  ];

  for (const [key, val] of Object.entries(values) as [keyof PropertyFormValues, unknown][]) {
    if (ARRAY_KEYS.includes(key)) {
      fd.append(key, JSON.stringify(val as string[]));
    } else if (BOOL_KEYS.includes(key)) {
      fd.append(key, String(val as boolean));
    } else {
      fd.append(key, String(val ?? ''));
    }
  }

  // Files
  for (const entry of files) {
    fd.append('files[]', entry.file, entry.file.name);
  }

  return fd;
}
