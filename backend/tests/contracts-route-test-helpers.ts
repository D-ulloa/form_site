import express from 'express';
import {
  RENT_CONTRACT_SCHEMA_ID,
  getContractSchemaDefinition,
} from '../src/config/contractSchemas.js';
import type {
  ContractFieldDefinition,
  ContractFieldValue,
} from '../src/contracts/types.js';
import { createContractsRouter, type ContractsRouterDependencies } from '../src/routes/contracts.js';
import type { ContractAuditLog } from '../src/services/contractAuditLogger.js';
import type { ContractSubmissionReceipt } from '../src/services/createContractSubmission.js';

export const ROUTE_ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  CONTRACTS_API_KEY: 'route-test-api-key',
  CONTRACT_GOOGLE_FORM_LINK: 'https://forms.gle/route-test',
  CONTRACT_GOOGLE_SHEET_ID: 'spreadsheet-id',
  CONTRACT_GOOGLE_SHEET_NAME: 'Contracts',
};

export const ROUTE_RECEIPT: ContractSubmissionReceipt = {
  submissionId: 'SUB-2026-07-21-A1B2C3D4',
  timestamp: '2026-07-21T18:30:00.000Z',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/spreadsheet-id/edit',
  appendedRange: 'Contracts!A42:AG42',
  auditUrl: '/api/contracts/audits/SUB-2026-07-21-A1B2C3D4',
};

export const ROUTE_AUDIT: ContractAuditLog = {
  schemaId: RENT_CONTRACT_SCHEMA_ID,
  contractType: RENT_CONTRACT_SCHEMA_ID,
  fields: { tenant_full_name: '[REDACTED]', contract_months: 24 },
  mappedRow: ['[REDACTED]', 24],
  spreadsheetId: 'spreadsheet-id',
  sheetName: 'Contracts',
  appendedRange: 'Contracts!A42:AG42',
  submissionId: 'SUB-2026-07-21-A1B2C3D4',
  userId: 'user-123',
  timestamp: '2026-07-21T18:30:00.000Z',
  requestId: 'audit-request-id',
  ip: '203.0.113.10',
};

function valueFor(field: ContractFieldDefinition): ContractFieldValue {
  if (field.type === 'number') return field.min ?? 1;
  if (field.type === 'date') return '2026-08-01';
  if (field.type === 'boolean') return false;
  if (field.type === 'email') return `${field.name}@example.com`;
  if (field.type === 'select') return field.options?.[0] ?? '';
  return `${field.name} value`;
}

export function buildValidRouteRequest(userId = 'user-123') {
  const schema = getContractSchemaDefinition(RENT_CONTRACT_SCHEMA_ID);
  const fields: Record<string, ContractFieldValue> = {};
  for (const field of schema.sections.flatMap((section) => section.fields)) {
    if (field.required) fields[field.name] = valueFor(field);
  }

  return {
    schemaId: schema.schemaId,
    contractType: schema.contractType,
    fields,
    meta: { userId, origin: 'ui' as const },
  };
}

export function createContractRouteTestApp(
  overrides: Partial<ContractsRouterDependencies> = {},
) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/contracts', createContractsRouter({
    environment: ROUTE_ENVIRONMENT,
    createSubmission: async () => ROUTE_RECEIPT,
    readAudit: async () => ROUTE_AUDIT,
    generateRequestId: () => 'generated-request-id',
    log: () => undefined,
    ...overrides,
  }));
  return app;
}
