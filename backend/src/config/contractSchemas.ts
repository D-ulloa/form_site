import type {
  ContractFieldDefinition,
  ContractSchemaConfig,
  ContractSchemaDefinition,
  PublicContractSchema,
} from '../contracts/types.js';

import {
  isValidContractGoogleFormLink,
  isValidContractSheetName,
  isValidContractSpreadsheetId,
} from './contractEnvironmentValidation.js';

export const RENT_CONTRACT_SCHEMA_ID = 'rent-contract-v1';

const sections = [
  {
    title: 'Inquilino',
    fields: [
      { name: 'tenant_full_name', label: 'Nombre Completo (Apellidos, Nombres)', type: 'string', required: true, sensitive: true },
      { name: 'tenant_dni', label: 'DNI (Separar con puntos)', type: 'string', required: true, sensitive: true },
      { name: 'tenant_phone', label: 'Número de Contacto del inquilino', type: 'string', required: true, sensitive: true },
      { name: 'tenant_nationality', label: 'Nacionalidad', type: 'string', required: true, sensitive: true },
      { name: 'tenant_email', label: 'Correo', type: 'email', required: true, sensitive: true },
      { name: 'tenant_age', label: 'Edad', type: 'number', required: true, min: 0, sensitive: true },
    ],
  },
  {
    title: 'Garante',
    fields: [
      { name: 'guarantor_full_name', label: 'Nombre Completo (Apellidos, Nombres)', type: 'string', required: true, sensitive: true },
      { name: 'guarantor_dni', label: 'DNI (Separar con puntos)', type: 'string', required: true, sensitive: true },
      { name: 'guarantor_phone', label: 'Número de Contacto del garante', type: 'string', required: true, sensitive: true },
      { name: 'guarantor_nationality', label: 'Nacionalidad', type: 'string', required: true, sensitive: true },
      { name: 'guarantor_email', label: 'Correo', type: 'email', required: true, sensitive: true },
      { name: 'guarantor_address', label: 'Domicilio Especial En la Ciudad de Córdoba (Dirección, Barrio, Ciudad, Provincia)', type: 'string', required: true, sensitive: true },
      { name: 'guarantor_company', label: 'Empresa', type: 'string', required: false, sensitive: true },
      { name: 'guarantor_cuit', label: 'CUIT Empresa (Separar con guión)', type: 'string', required: false, sensitive: true },
      { name: 'guarantor_position', label: 'Cargo', type: 'string', required: false, sensitive: true },
      { name: 'guarantor_employee_id', label: 'Nº de Legajo', type: 'string', required: false, sensitive: true },
      { name: 'guarantor_company_registration', label: 'Número de Contacto de la Empresa', type: 'string', required: false, sensitive: true },
      { name: 'property_registration_number', label: 'Número de Matrícula de la propiedad', type: 'string', required: true, sensitive: true },
      { name: 'property_province', label: 'Provincia de la Propiedad', type: 'string', required: true },
      { name: 'property_address', label: 'Dirección de la propiedad (Dirección, Barrio, Ciudad, Provincia)', type: 'string', required: true, sensitive: true },
    ],
  },
  {
    title: 'Propietario',
    fields: [
      { name: 'witness_full_name', label: 'Nombre Completo (Apellidos, Nombres)', type: 'string', required: true, sensitive: true },
      { name: 'witness_dni', label: 'DNI (Separar con puntos)', type: 'string', required: true, sensitive: true },
      { name: 'witness_nationality', label: 'Nacionalidad', type: 'string', required: true, sensitive: true },
    ],
  },
  {
    title: 'Contrato',
    fields: [
      { name: 'contract_object', label: '1ra. Objeto', type: 'string', required: true },
      { name: 'contract_months', label: 'meses', type: 'number', required: true, min: 1 },
      { name: 'contract_start_date', label: 'Inicio (MM/DD/AAAA)', type: 'date', required: true },
      { name: 'contract_formatted_start', label: 'Formateada_1', type: 'date', required: true },
      { name: 'contract_rent_amount', label: 'Monto alquiler', type: 'number', required: true, min: 0, sensitive: true },
      { name: 'contract_update', label: 'Actualización', type: 'number', required: false, min: 0 },
      { name: 'contract_formatted_update', label: 'Formateada_2', type: 'date', required: false },
      { name: 'contract_selection', label: 'Ajuste', type: 'string', required: false },
      { name: 'submission_date', label: 'Fecha Actual', type: 'date', required: true },
      { name: 'approve_contract', label: 'Aprobar Contrato', type: 'string', required: true },
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
