import type {
  ContractFieldDefinition,
  ContractRole,
  ContractRoleSchema,
  ContractSchemaConfig,
  ContractSchemaDefinition,
  PublicContractSchema,
} from '../contracts/types.js';

import {
  isValidContractGoogleFormLink,
  isValidContractSheetName,
  isValidContractSpreadsheetId,
} from './contractEnvironmentValidation.js';
import {
  CONTRACT_EVIDENCE_FILE_MIME_TYPES,
  getContractEvidenceMaxFileBytes,
} from '../services/contractEvidenceUploadService.js';

export const RENT_CONTRACT_SCHEMA_ID = 'rent-contract-v1';

const sections = [
  {
    title: 'Inquilino',
    fields: [
      { name: 'tenant_full_name', label: 'Nombre Completo (Apellidos, Nombres)', placeholder: 'Juan Pérez', type: 'string', required: true, sensitive: true },
      { name: 'tenant_dni', label: 'DNI (Separar con puntos)', placeholder: '12.345.678', type: 'string', required: true, sensitive: true },
      { name: 'tenant_phone', label: 'Número de Contacto del inquilino', placeholder: '+54 9 11 1234-5678', type: 'string', required: true, sensitive: true },
      { name: 'tenant_nationality', label: 'Nacionalidad', placeholder: 'Argentina', type: 'string', required: true, sensitive: true },
      { name: 'tenant_email', label: 'Correo', placeholder: 'juan.perez@ejemplo.com', type: 'email', required: true, sensitive: true },
      { name: 'tenant_age', label: 'Edad', placeholder: '35', type: 'number', required: true, min: 0, sensitive: true },
    ],
  },
  {
    title: 'Garante',
    fields: [
      { name: 'guarantor_full_name', label: 'Nombre Completo (Apellidos, Nombres)', placeholder: 'María Pérez', type: 'string', required: true, sensitive: true },
      { name: 'guarantor_dni', label: 'DNI (Separar con puntos)', placeholder: '23.456.789', type: 'string', required: true, sensitive: true },
      { name: 'guarantor_phone', label: 'Número de Contacto del garante', placeholder: '+54 9 351 765-4321', type: 'string', required: true, sensitive: true },
      { name: 'guarantor_nationality', label: 'Nacionalidad', placeholder: 'Argentina', type: 'string', required: true, sensitive: true },
      { name: 'guarantor_email', label: 'Correo', placeholder: 'maria.perez@ejemplo.com', type: 'email', required: true, sensitive: true },
      { name: 'guarantor_address', label: 'Domicilio Especial En la Ciudad de Córdoba (Dirección, Barrio, Ciudad, Provincia)', placeholder: 'Av. Colón 1234, Córdoba', type: 'string', required: true, sensitive: true },
      { name: 'guarantor_company', label: 'Empresa', placeholder: 'Empresa Ejemplo S.A.', type: 'string', required: false, sensitive: true },
      { name: 'guarantor_cuit', label: 'CUIT Empresa (Separar con guión)', placeholder: '30-12345678-9', type: 'string', required: false, sensitive: true },
      { name: 'guarantor_position', label: 'Cargo', placeholder: 'Administrativo', type: 'string', required: false, sensitive: true },
      { name: 'guarantor_employee_id', label: 'Nº de Legajo', placeholder: '12345', type: 'string', required: false, sensitive: true },
      { name: 'guarantor_company_registration', label: 'Número de Contacto de la Empresa', placeholder: '351-1234567', type: 'string', required: false, sensitive: true },
      { name: 'property_registration_number', label: 'Número de Matrícula de la propiedad', placeholder: 'Matrícula 123456', type: 'string', required: true, sensitive: true },
      { name: 'property_province', label: 'Provincia de la Propiedad', placeholder: 'Córdoba', type: 'string', required: true },
      { name: 'property_address', label: 'Dirección de la propiedad (Dirección, Barrio, Ciudad, Provincia)', placeholder: 'Av. Santa Fe 1234, CABA', type: 'string', required: true, sensitive: true },
    ],
  },
  {
    title: 'Propietario',
    fields: [
      { name: 'witness_full_name', label: 'Nombre Completo (Apellidos, Nombres)', placeholder: 'Juan Pérez', type: 'string', required: true, sensitive: true },
      { name: 'witness_dni', label: 'DNI (Separar con puntos)', placeholder: '12.345.678', type: 'string', required: true, sensitive: true },
      { name: 'witness_nationality', label: 'Nacionalidad', placeholder: 'Argentina', type: 'string', required: true, sensitive: true },
    ],
  },
  {
    title: 'Contrato',
    fields: [
      { name: 'contract_object', label: '1ra. Objeto', placeholder: 'Vivienda', type: 'string', required: true },
      { name: 'contract_months', label: 'meses', placeholder: '24', type: 'number', required: true, min: 1, integer: true },
      { name: 'contract_start_date', label: 'Inicio (MM/DD/AAAA)', placeholder: '31/12/2026', type: 'date', required: true },
      {
        name: 'contract_formatted_start',
        label: 'Formateada_1',
        placeholder: '31/12/2026',
        type: 'date',
        required: true,
        readOnly: true,
        computed: 'formatted_start',
      },
      { name: 'contract_rent_amount', label: 'Monto alquiler', placeholder: '850000', type: 'number', required: true, min: 0, sensitive: true },
      { name: 'contract_update', label: 'Actualización', placeholder: '6', type: 'number', required: false, min: 0, integer: true },
      {
        name: 'contract_formatted_update',
        label: 'Formateada_2',
        placeholder: '31/12/2026',
        type: 'date',
        required: false,
        readOnly: true,
        computed: 'formatted_update',
      },
      {
        name: 'contract_selection',
        label: 'Ajuste',
        placeholder: 'Seleccioná IPC o ICL',
        type: 'select',
        required: false,
        options: ['IPC', 'ICL'],
      },
      { name: 'submission_date', label: 'Fecha de contrato', placeholder: '31/12/2026', type: 'date', required: true },
    ],
  },
] as const satisfies readonly {
  readonly title: string;
  readonly fields: readonly ContractFieldDefinition[];
}[];

const orderedFields: ContractFieldDefinition[] = [];
for (const section of sections) {
  for (const field of section.fields) {
    orderedFields.push(field);
  }
}
const columnMap = Object.fromEntries(
  orderedFields.map((field) => [field.name, field.label]),
) as Readonly<Record<string, string>>;

const rentContractSchema: ContractSchemaDefinition = {
  schemaId: RENT_CONTRACT_SCHEMA_ID,
  contractType: RENT_CONTRACT_SCHEMA_ID,
  sections,
  columnMap,
};

const schemaRegistry: ReadonlyMap<string, ContractSchemaDefinition> = new Map([
  [rentContractSchema.schemaId, rentContractSchema],
]);

export class ContractSchemaNotFoundError extends Error {
  readonly schemaId: string;

  constructor(schemaId: string) {
    super(`Contract schema "${schemaId}" was not found.`);
    this.name = 'ContractSchemaNotFoundError';
    this.schemaId = schemaId;
  }
}

export class ContractConfigurationError extends Error {
  readonly missingVariables: readonly string[];

  constructor(missingVariables: readonly string[]) {
    super(
      `Contract generation is not configured. Set ${missingVariables.join(', ')} and restart the backend.`,
    );
    this.name = 'ContractConfigurationError';
    this.missingVariables = missingVariables;
  }
}

function requireEnvironmentValues(
  names: readonly string[],
  environment: NodeJS.ProcessEnv,
): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  const missing: string[] = [];

  for (const name of names) {
    const value = environment[name]?.trim();
    if (!value) {
      missing.push(name);
      continue;
    }
    values[name] = value;
  }

  if (missing.length > 0) {
    throw new ContractConfigurationError(missing);
  }

  return values;
}

export function getContractSchemaDefinition(
  schemaId: string,
): ContractSchemaDefinition {
  const schema = schemaRegistry.get(schemaId);
  if (!schema) {
    throw new ContractSchemaNotFoundError(schemaId);
  }
  return schema;
}

export function getContractRoleSchema(
  schemaId: string,
  role: ContractRole,
  environment: NodeJS.ProcessEnv = process.env,
): ContractRoleSchema {
  const schema = getContractSchemaDefinition(schemaId);
  const selectedTitles = role === 'client'
    ? new Set(['Inquilino', 'Garante'])
    : new Set(['Propietario', 'Contrato']);
  const publicTitles: Readonly<Record<string, string>> = {
    Garante: 'Garantes',
  };
  const guarantorLabels: Readonly<Record<string, string>> = {
    guarantor_cuit: 'Cuit Empresa',
    guarantor_employee_id: 'N de Legajo',
    guarantor_company_registration: 'Numero de contacto de la empresa',
    property_registration_number: 'Numero de matricula de la propiedad',
    property_province: 'Provincia de la propiedad',
    property_address: 'Direccion de la propiedad',
  };
  const conditionalPropertyFields = new Set([
    'property_registration_number',
    'property_province',
    'property_address',
  ]);
  const roleSections = schema.sections
    .filter((section) => selectedTitles.has(section.title))
    .map((section) => {
      const isClientGuarantor = role === 'client' && section.title === 'Garante';
      const roleFields: readonly ContractFieldDefinition[] = isClientGuarantor
        ? [
            ...section.fields.map((field): ContractFieldDefinition => ({
              ...field,
              label: guarantorLabels[field.name] ?? field.label,
              required: conditionalPropertyFields.has(field.name)
                ? false
                : field.required,
            })),
            {
              name: 'property_type',
              label: 'Tipo de propiedad',
              placeholder: 'Casa',
              type: 'string',
              required: false,
            },
          ]
        : section.fields;

      return {
        title: publicTitles[section.title] ?? section.title,
        fields: roleFields,
        ...(role === 'client' && section.title === 'Inquilino'
          ? {
              repeatable: {
                name: 'inquilinos',
                itemLabel: 'Inquilino',
                addLabel: 'Agregar Inquilino',
                minItems: 1,
              } as const,
              uploads: [
                {
                  name: 'tenant_dni_front_image',
                  label: 'Frente DNI',
                  slot: 'front',
                  required: true,
                },
                {
                  name: 'tenant_dni_back_image',
                  label: 'Dorso DNI',
                  slot: 'back',
                  required: true,
                },
              ] as const,
            }
          : {}),
        ...(isClientGuarantor
          ? {
              repeatable: {
                name: 'garantes',
                itemLabel: 'Garante',
                addLabel: 'Agregar Garante',
                minItems: 1,
              } as const,
              uploads: [
                {
                  name: 'guarantor_dni_front_image',
                  label: 'Frente DNI',
                  slot: 'front',
                  required: true,
                },
                {
                  name: 'guarantor_dni_back_image',
                  label: 'Dorso DNI',
                  slot: 'back',
                  required: true,
                },
              ] as const,
              subsections: [
                {
                  title: 'Recibo de sueldo',
                  fieldNames: [
                    'guarantor_company',
                    'guarantor_cuit',
                    'guarantor_position',
                    'guarantor_employee_id',
                    'guarantor_company_registration',
                  ],
                  fileReceivers: [
                    {
                      name: 'recibo_sueldo_files',
                      label: 'Subir recibo de sueldo',
                      maxFiles: 2,
                      maxSizeBytes: getContractEvidenceMaxFileBytes(environment),
                      acceptedMimeTypes: CONTRACT_EVIDENCE_FILE_MIME_TYPES,
                    },
                  ],
                },
                {
                  title: 'Garantía propietaria',
                  fieldNames: [
                    'property_registration_number',
                    'property_province',
                    'property_address',
                    'property_type',
                  ],
                  fileReceivers: [
                    {
                      name: 'garantia_propietaria_files',
                      label: 'Subir garantía propietaria',
                      maxFiles: 2,
                      maxSizeBytes: getContractEvidenceMaxFileBytes(environment),
                      acceptedMimeTypes: CONTRACT_EVIDENCE_FILE_MIME_TYPES,
                    },
                  ],
                },
              ] as const,
            }
          : {}),
        ...(role === 'user' && section.title === 'Contrato'
          ? {
              subsections: [
                {
                  title: 'Vigencia',
                  fieldNames: [
                    'contract_months',
                    'contract_start_date',
                    'contract_formatted_start',
                  ],
                },
                {
                  title: 'Canon',
                  fieldNames: [
                    'contract_rent_amount',
                    'contract_update',
                    'contract_formatted_update',
                  ],
                },
                {
                  title: 'Ajuste',
                  fieldNames: [
                    'contract_selection',
                    'submission_date',
                  ],
                },
              ] as const,
            }
          : {}),
      };
    });

  return {
    schemaId: schema.schemaId,
    contractType: schema.contractType,
    role,
    sections: roleSections,
  };
}

export function getPublicContractSchema(
  schemaId: string,
  environment: NodeJS.ProcessEnv = process.env,
): PublicContractSchema {
  const schema = getContractSchemaDefinition(schemaId);
  const values = requireEnvironmentValues(
    ['CONTRACT_GOOGLE_FORM_LINK'],
    environment,
  );
  if (!isValidContractGoogleFormLink(values.CONTRACT_GOOGLE_FORM_LINK ?? '')) {
    throw new ContractConfigurationError(['CONTRACT_GOOGLE_FORM_LINK']);
  }

  return {
    schemaId: schema.schemaId,
    contractType: schema.contractType,
    googleFormLink: values.CONTRACT_GOOGLE_FORM_LINK ?? '',
    sections: schema.sections,
  };
}

export function getContractSchemaConfig(
  schemaId: string,
  environment: NodeJS.ProcessEnv = process.env,
): ContractSchemaConfig {
  const schema = getContractSchemaDefinition(schemaId);
  const values = requireEnvironmentValues(
    [
      'CONTRACT_GOOGLE_FORM_LINK',
      'CONTRACT_GOOGLE_SHEET_ID',
      'CONTRACT_GOOGLE_SHEET_NAME',
    ],
    environment,
  );
  if (!isValidContractGoogleFormLink(values.CONTRACT_GOOGLE_FORM_LINK ?? '')) {
    throw new ContractConfigurationError(['CONTRACT_GOOGLE_FORM_LINK']);
  }
  if (!isValidContractSpreadsheetId(values.CONTRACT_GOOGLE_SHEET_ID ?? '')) {
    throw new ContractConfigurationError(['CONTRACT_GOOGLE_SHEET_ID']);
  }
  if (!isValidContractSheetName(values.CONTRACT_GOOGLE_SHEET_NAME ?? '')) {
    throw new ContractConfigurationError(['CONTRACT_GOOGLE_SHEET_NAME']);
  }

  return {
    schemaId: schema.schemaId,
    contractType: schema.contractType,
    googleFormLink: values.CONTRACT_GOOGLE_FORM_LINK ?? '',
    sections: schema.sections,
    sheet: {
      spreadsheetId: values.CONTRACT_GOOGLE_SHEET_ID ?? '',
      sheetName: values.CONTRACT_GOOGLE_SHEET_NAME ?? '',
      columnMap: schema.columnMap,
    },
  };
}
