import type { ValidatedPropertyPayload } from '../services/validatePropertyPayload.js';

export interface SheetRowMeta {
  property_id: string;
  submission_id: string;
  created_at: string;
  agent_name: string;
  agent_email: string;
  drive_folder_name: string;
  drive_folder_url: string;
  media_file_count: number;
  make_status: string;
  sheets_status: string;
}

/**
 * Maps a validated payload + system metadata into an ordered flat array
 * ready to append to Google Sheets.
 *
 * Column order:
 *   [system cols] property_id | submission_id | created_at | agent_name |
 *   agent_email | drive_folder_name | drive_folder_url | media_file_count |
 *   make_status | sheets_status | [property fields in scheme.json order]
 *
 * Array fields are joined as comma-separated strings for Sheets readability.
 */
export function mapToSheetRow(
  payload: ValidatedPropertyPayload,
  meta: SheetRowMeta,
): (string | number | boolean)[] {
  return [
    // ── System columns ──────────────────────────────────────────
    meta.property_id,
    meta.submission_id,
    meta.created_at,
    meta.agent_name,
    meta.agent_email,
    meta.drive_folder_name,
    meta.drive_folder_url,
    meta.media_file_count,
    meta.make_status,
    meta.sheets_status,

    // ── Property fields (scheme.json order) ─────────────────────
    payload.tipo_propiedad,
    payload.operación,
    payload.dirección,
    payload.barrio,
    payload.zona,
    payload.ciudad,
    payload.dormitorios,
    payload.baños,
    payload.precio,
    payload.expensas,
    payload.info_relevante,
    payload.Medidas,
    payload.amoblado,
    payload.barrio_cerrado,
    payload.cochera,
    payload.ascensor,
    payload.patio,
    payload.terraza,
    payload.balcon,
    payload.mascotas,
    payload.Pileta,
    payload.tipo_contrato,
    payload.Instalaciones,
    payload.Bauleras,
    payload.Orientación,
    payload['Cantidad de plantas'],
    payload['Cobertura de Cochera'],
    payload['Propiedad Ocupada'],
    payload['Apto para Escritura'],
    payload['A estrenar'],
    payload['Antigüedad en años'],
    payload['Forma de pago'],
    payload['Apto crédito'],
    payload['Cantidad de pisos'],
    payload['Número del departamento'],
    payload['Departamentos por piso'],
    payload['Número de piso de la unidad'],
    payload.Orientación_2,
    payload['Tipo de seguridad'],
    payload.Seguridad,
    payload['Conexión para lavarropas'],
    payload.Servicios.join(', '),
    payload['Comodidades y equipamiento'].join(', '),
    payload['Espacios comunes'].join(', '),
    payload.Otros.join(', '),
    payload.Seguridad_2.join(', '),
  ];
}
