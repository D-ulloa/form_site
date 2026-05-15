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
 *   make_status | sheets_status | [property fields in scheme_reworked.json order]
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

    // ── Property fields (scheme_reworked.json order) ─────────────────
    payload['Tipo de Inmueble'],
    payload['Operación'],
    payload.Dormitorios,
    payload.Ambientes,
    payload.Precio,
    payload.Expensas,
    payload.Moneda,
    payload['Apto crédito'],
    payload.Escritura,
    payload['Unidad en Pozo'],
    payload.Cartel,
    payload.Propietario,
    payload['Asesor comercial'],
    payload.Productor,
    payload.Sucursal,
    payload.Pais,
    payload.Provincia,
    payload.Localidad,
    payload.Barrio,
    payload.Calle,
    payload['Número'],
    payload['Piso | Mza | Denominacion'],
    payload['Depto | Lote |'],
    payload.Referencia,
    payload['Baños'],
    payload.Plantas,
    payload.Antiguedad,
    payload['Estado general'],
    payload['Apto para'],
    payload.Estilo,
    payload.Orientacion,
    payload['Sup Terreno | Hectáreas'],
    payload['Sup Terraza'],
    payload['Sup Balcon'],
    payload['Otras superficies'],
    payload['Metros cubiertos'],
    payload['Sup de Jardin'],
    payload['Mts de Frente'],
    payload['Mts de Fondo'],
    payload.Llaves,
    payload['Descrp. de dormitorio 1'],
    payload['Descrp. de dormitorio 2'],
    payload['Descrp. de dormitorio 3'],
    payload['Descrp. de dormitorio 4'],
    payload['Descrp. de dormitorio 5'],
    payload.Garage,
    payload['Living Comedor'],
    payload['Cocina Comedor'],
    payload['Comedor diario'],
    payload['Ante Cocina'],
    payload.Dependencias,
    payload.Patio,
    payload.Pileta,
    payload.Hogar,
    payload['Area de parrilla'],
    payload.Quincho,
    payload['Suite Principal'],
    payload.Vestidor,
    payload['Sala estar'],
    payload.Estudio,
    payload.Escritorio,
    payload.Lavadero,
    payload['Hall acceso'],
    payload['Hall distrib.'],
    payload['Gas Natural'],
    payload['Gas en tubos'],
    payload.Cloacas,
    payload.Sotano,
    payload.Bodega,
    payload.Despensa,
    payload['Play room'],
    payload.Bar,
    payload['Jardín inv.'],
    payload['Cámara Sept.'],
    payload['Galería'],
    payload.Altillo,
    payload.Terraza,
    payload['Aire A.Central'],
    payload['Aire A. Ind.'],
    payload.Calefactores,
    payload['Calef. central'],
    payload['Tiro balanc.'],
    payload['Calefón'],
    payload.Estractor,
    payload.Termotanque,
    payload.Alarma,
    payload['Agua cte.'],
    payload.Toillette,
    payload.Hidromasaje,
    payload.Jacuzzi,
    payload.Balcon,
    payload.Observaciones,
    payload['Notas Privadas'],
    payload.Titulo,
    payload.Detalle,
  ];
}
