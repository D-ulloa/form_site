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
      tipo_propiedad: payload.tipo_propiedad,
      operación: payload.operación,
      dirección: payload.dirección,
      barrio: payload.barrio,
      zona: payload.zona,
      ciudad: payload.ciudad,
      dormitorios: payload.dormitorios,
      baños: payload.baños,
      precio: payload.precio,
      expensas: payload.expensas,
      info_relevante: payload.info_relevante,
      Medidas: payload.Medidas,
      amoblado: payload.amoblado,
      barrio_cerrado: payload.barrio_cerrado,
      cochera: payload.cochera,
      ascensor: payload.ascensor,
      patio: payload.patio,
      terraza: payload.terraza,
      balcon: payload.balcon,
      mascotas: payload.mascotas,
      Pileta: payload.Pileta,
      tipo_contrato: payload.tipo_contrato,
      Instalaciones: payload.Instalaciones,
      Bauleras: payload.Bauleras,
      Orientación: payload.Orientación,
      'Cantidad de plantas': payload['Cantidad de plantas'],
      'Cobertura de Cochera': payload['Cobertura de Cochera'],
      'Propiedad Ocupada': payload['Propiedad Ocupada'],
      'Apto para Escritura': payload['Apto para Escritura'],
      'A estrenar': payload['A estrenar'],
      'Antigüedad en años': payload['Antigüedad en años'],
      'Forma de pago': payload['Forma de pago'],
      'Apto crédito': payload['Apto crédito'],
      'Cantidad de pisos': payload['Cantidad de pisos'],
      'Número del departamento': payload['Número del departamento'],
      'Departamentos por piso': payload['Departamentos por piso'],
      'Número de piso de la unidad': payload['Número de piso de la unidad'],
      Orientación_2: payload.Orientación_2,
      'Tipo de seguridad': payload['Tipo de seguridad'],
      Seguridad: payload.Seguridad,
      'Conexión para lavarropas': payload['Conexión para lavarropas'],
      Servicios: payload.Servicios,
      'Comodidades y equipamiento': payload['Comodidades y equipamiento'],
      'Espacios comunes': payload['Espacios comunes'],
      Otros: payload.Otros,
      Seguridad_2: payload.Seguridad_2,
    },
  };
}
