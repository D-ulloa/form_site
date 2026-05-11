import { sanitizeText } from '../utils/sanitizeText.js';

export interface FolderNameParts {
  ciudad: string;
  tipo_propiedad: string;
  dirección: string;
}

/**
 * Builds a deterministic Drive folder name.
 * Format: OP-{ciudad}-{tipo_propiedad}-{direccion}-{YYYYMMDD}-{HHmm}
 * Example: OP-mar-del-plata-departamento-av-colon-1234-20260510-2128
 */
export function buildFolderName(
  parts: FolderNameParts,
  now: Date = new Date(),
): string {
  const ciudad = sanitizeText(parts.ciudad);
  const tipo = sanitizeText(parts.tipo_propiedad);
  const dir = sanitizeText(parts.dirección);

  const year = now.getFullYear().toString();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const timestamp = `${year}${month}${day}-${hours}${minutes}`;

  return `OP-${ciudad}-${tipo}-${dir}-${timestamp}`;
}
