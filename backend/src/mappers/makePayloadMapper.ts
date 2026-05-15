import type { MakePayload, MediaFile } from '../types.js';
import type { ValidatedPropertyPayload } from '../services/validatePropertyPayload.js';

export interface BuildMakePayloadArgs {
  property_id: string;
  submission_id: string;
  created_at: string;
  payload: ValidatedPropertyPayload;
  folder_name: string;
  folder_url: string;
  parent_folder_id: string;
  media_files: MediaFile[];
  total_size_bytes: number;
}

/**
 * Assembles the canonical Make webhook payload from validated form data
 * and resolved integration metadata (Drive, media).
 */
export function buildMakePayload(args: BuildMakePayloadArgs): MakePayload {
  const {
    property_id,
    submission_id,
    created_at,
    payload,
    folder_name,
    folder_url,
    parent_folder_id,
    media_files,
    total_size_bytes,
  } = args;

  const detalle = payload.Detalle || payload.Observaciones;

  return {
    property_id,
    submission_id,
    created_at,
    created_by: {
      user_id: payload.agent_user_id,
      name: payload.agent_name,
      email: payload.agent_email,
    },
    google_drive: {
      folder_name,
      folder_url,
      parent_folder_id,
    },
    media: {
      total_size_bytes,
      cover_file_name: payload.cover_file_name,
      files: media_files,
    },
    property: {
      'Tipo de Inmueble': payload['Tipo de Inmueble'],
      'Operación': payload['Operación'],
      Dormitorios: payload.Dormitorios,
      Ambientes: payload.Ambientes,
      Precio: payload.Precio,
      Expensas: payload.Expensas,
      Moneda: payload.Moneda,
      'Apto crédito': payload['Apto crédito'],
      Escritura: payload.Escritura,
      'Unidad en Pozo': payload['Unidad en Pozo'],
      Cartel: payload.Cartel,
      Propietario: payload.Propietario,
      'Asesor comercial': payload['Asesor comercial'],
      Productor: payload.Productor,
      Sucursal: payload.Sucursal,
      Pais: payload.Pais,
      Provincia: payload.Provincia,
      Localidad: payload.Localidad,
      Barrio: payload.Barrio,
      Calle: payload.Calle,
      'Número': payload['Número'],
      'Piso | Mza | Denominacion': payload['Piso | Mza | Denominacion'],
      'Depto | Lote |': payload['Depto | Lote |'],
      Referencia: payload.Referencia,
      'Baños': payload['Baños'],
      Plantas: payload.Plantas,
      Antiguedad: payload.Antiguedad,
      'Estado general': payload['Estado general'],
      'Apto para': payload['Apto para'],
      Estilo: payload.Estilo,
      Orientacion: payload.Orientacion,
      'Sup Terreno | Hectáreas': payload['Sup Terreno | Hectáreas'],
      'Sup Terraza': payload['Sup Terraza'],
      'Sup Balcon': payload['Sup Balcon'],
      'Otras superficies': payload['Otras superficies'],
      'Metros cubiertos': payload['Metros cubiertos'],
      'Sup de Jardin': payload['Sup de Jardin'],
      'Mts de Frente': payload['Mts de Frente'],
      'Mts de Fondo': payload['Mts de Fondo'],
      Llaves: payload.Llaves,
      'Descrp. de dormitorio 1': payload['Descrp. de dormitorio 1'],
      'Descrp. de dormitorio 2': payload['Descrp. de dormitorio 2'],
      'Descrp. de dormitorio 3': payload['Descrp. de dormitorio 3'],
      'Descrp. de dormitorio 4': payload['Descrp. de dormitorio 4'],
      'Descrp. de dormitorio 5': payload['Descrp. de dormitorio 5'],
      Garage: payload.Garage,
      'Living Comedor': payload['Living Comedor'],
      'Cocina Comedor': payload['Cocina Comedor'],
      'Comedor diario': payload['Comedor diario'],
      'Ante Cocina': payload['Ante Cocina'],
      Dependencias: payload.Dependencias,
      Patio: payload.Patio,
      Pileta: payload.Pileta,
      Hogar: payload.Hogar,
      'Area de parrilla': payload['Area de parrilla'],
      Quincho: payload.Quincho,
      'Suite Principal': payload['Suite Principal'],
      Vestidor: payload.Vestidor,
      'Sala estar': payload['Sala estar'],
      Estudio: payload.Estudio,
      Escritorio: payload.Escritorio,
      Lavadero: payload.Lavadero,
      'Hall acceso': payload['Hall acceso'],
      'Hall distrib.': payload['Hall distrib.'],
      'Gas Natural': payload['Gas Natural'],
      'Gas en tubos': payload['Gas en tubos'],
      Cloacas: payload.Cloacas,
      Sotano: payload.Sotano,
      Bodega: payload.Bodega,
      Despensa: payload.Despensa,
      'Play room': payload['Play room'],
      Bar: payload.Bar,
      'Jardín inv.': payload['Jardín inv.'],
      'Cámara Sept.': payload['Cámara Sept.'],
      'Galería': payload['Galería'],
      Altillo: payload.Altillo,
      Terraza: payload.Terraza,
      'Aire A.Central': payload['Aire A.Central'],
      'Aire A. Ind.': payload['Aire A. Ind.'],
      Calefactores: payload.Calefactores,
      'Calef. central': payload['Calef. central'],
      'Tiro balanc.': payload['Tiro balanc.'],
      'Calefón': payload['Calefón'],
      Estractor: payload.Estractor,
      Termotanque: payload.Termotanque,
      Alarma: payload.Alarma,
      'Agua cte.': payload['Agua cte.'],
      Toillette: payload.Toillette,
      Hidromasaje: payload.Hidromasaje,
      Jacuzzi: payload.Jacuzzi,
      Balcon: payload.Balcon,
      Observaciones: payload.Observaciones,
      'Notas Privadas': payload['Notas Privadas'],
      Titulo: payload.Titulo,
      Detalle: detalle,
    },
  };
}
