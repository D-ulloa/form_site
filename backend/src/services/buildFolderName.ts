import { sanitizeText } from '../utils/sanitizeText.js';

export interface FolderNameParts {
  localidad: string;
  tipo_de_inmueble: string;
  calle: string;
}

/**
 * Builds a deterministic Drive folder name.
 * Format: OP-{localidad}-{tipo_de_inmueble}-{calle}-{YYYYMMDD}-{HHmm}
 * Example: OP-mar-del-plata-departamento-av-colon-1234-20260510-2128
 */
export function buildFolderName(
  parts: FolderNameParts,
  now: Date = new Date(),
): string {
  const localidad = sanitizeText(parts.localidad);
  const tipo = sanitizeText(parts.tipo_de_inmueble);
  const dir = sanitizeText(parts.calle);

  const year = now.getFullYear().toString();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const timestamp = `${year}${month}${day}-${hours}${minutes}`;

  return `OP-${localidad}-${tipo}-${dir}-${timestamp}`;
}
