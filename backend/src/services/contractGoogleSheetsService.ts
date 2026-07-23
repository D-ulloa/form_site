import { google } from 'googleapis';
import type { ContractFieldValue } from '../contracts/types.js';
import {
  GoogleServiceAccountConfigurationError,
  createGoogleServiceAccountAuth,
} from '../utils/googleServiceAccountAuth.js';
import {
  ContractSheetsAppendError,
  getGoogleSheetsErrorStatus,
  isRetriableGoogleSheetsError,
} from './contractSheetsErrors.js';
import {
  assertContractSheetHeaders,
  buildContractSheetHeaderReadRequest,
  type ContractSheetHeaderReadExecutor,
  type ContractSheetHeaderReadRequest,
  type ContractSheetHeaderReadResponse,
} from './contractSheetHeaderValidation.js';

const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export interface ContractSheetAppendInput {
  readonly spreadsheetId: string;
  readonly sheetName: string;
  readonly columnHeaders: readonly string[];
  readonly row: readonly ContractFieldValue[];
}

export interface ContractSheetAppendRequest {
  readonly spreadsheetId: string;
  readonly range: string;
  readonly valueInputOption: 'RAW';
  readonly requestBody: {
    readonly values: readonly (readonly ContractFieldValue[])[];
  };
}

export interface ContractSheetAppendResponse {
  readonly data?: {
    readonly updates?: { readonly updatedRange?: string | null } | null;
  } | null;
}

export interface ContractSheetAppendResult {
  readonly appendedRange: string;
}

export type ContractSheetAppendExecutor = (
  request: ContractSheetAppendRequest,
) => Promise<ContractSheetAppendResponse>;

export interface ContractSheetAppendDependencies {
  readonly execute: ContractSheetAppendExecutor;
  readonly readHeaders: ContractSheetHeaderReadExecutor;
  readonly sleep: (delayMs: number) => Promise<void>;
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
}

export function buildContractSheetAppendRequest(
  input: ContractSheetAppendInput,
): ContractSheetAppendRequest {
  const quotedSheetName = `'${input.sheetName.replace(/'/gu, "''")}'`;
  return {
    spreadsheetId: input.spreadsheetId,
    range: `${quotedSheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[...input.row]] },
  };
}

async function executeGoogleHeaderRead(
  request: ContractSheetHeaderReadRequest,
): Promise<ContractSheetHeaderReadResponse> {
  const auth = createGoogleServiceAccountAuth(SHEETS_SCOPES);
  const sheets = google.sheets({ version: 'v4', auth });
  return sheets.spreadsheets.values.get({
    spreadsheetId: request.spreadsheetId,
    range: request.range,
    majorDimension: request.majorDimension,
    valueRenderOption: request.valueRenderOption,
  });
}

async function executeGoogleAppend(
  request: ContractSheetAppendRequest,
): Promise<ContractSheetAppendResponse> {
  const auth = createGoogleServiceAccountAuth(SHEETS_SCOPES);
  const sheets = google.sheets({ version: 'v4', auth });
  return sheets.spreadsheets.values.append({
    spreadsheetId: request.spreadsheetId,
    range: request.range,
    valueInputOption: request.valueInputOption,
    requestBody: {
      values: request.requestBody.values.map((row) => [...row]),
    },
  });
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function appendContractSheetRow(
  input: ContractSheetAppendInput,
  overrides: Partial<ContractSheetAppendDependencies> = {},
): Promise<ContractSheetAppendResult> {
  const dependencies: ContractSheetAppendDependencies = {
    execute: overrides.execute ?? executeGoogleAppend,
    readHeaders: overrides.readHeaders ?? executeGoogleHeaderRead,
    sleep: overrides.sleep ?? sleep,
    maxAttempts: overrides.maxAttempts ?? 3,
    initialDelayMs: overrides.initialDelayMs ?? 500,
  };
  const headerRequest = buildContractSheetHeaderReadRequest(input);
  let headerResponse: ContractSheetHeaderReadResponse;
  try {
    headerResponse = await dependencies.readHeaders(headerRequest);
  } catch (error) {
    if (
      error instanceof ContractSheetsAppendError ||
      error instanceof GoogleServiceAccountConfigurationError
    ) {
      throw error;
    }
    const retriable = isRetriableGoogleSheetsError(error);
    const providerStatus = getGoogleSheetsErrorStatus(error);
    throw new ContractSheetsAppendError({
      message: retriable
        ? 'Google Sheets headers are temporarily unavailable.'
        : 'Google Sheets headers could not be read. Verify credentials and destination configuration.',
      retriable,
      ...(providerStatus !== undefined ? { providerStatus } : {}),
      cause: error,
    });
  }
  assertContractSheetHeaders(input.columnHeaders, headerResponse);

  const request = buildContractSheetAppendRequest(input);
  let delayMs = dependencies.initialDelayMs;

  for (let attempt = 1; attempt <= dependencies.maxAttempts; attempt += 1) {
    try {
      const response = await dependencies.execute(request);
      const appendedRange = response.data?.updates?.updatedRange?.trim();
      if (!appendedRange) {
        throw new ContractSheetsAppendError({
          message: 'Google Sheets appended the row but did not return an updated range. Check the sheet before retrying.',
          retriable: false,
        });
      }
      return { appendedRange };
    } catch (error) {
      if (
        error instanceof ContractSheetsAppendError ||
        error instanceof GoogleServiceAccountConfigurationError
      ) {
        throw error;
      }

      const retriable = isRetriableGoogleSheetsError(error);
      if (!retriable || attempt === dependencies.maxAttempts) {
        const providerStatus = getGoogleSheetsErrorStatus(error);
        throw new ContractSheetsAppendError({
          message: retriable
            ? 'Google Sheets is temporarily unavailable after retry attempts.'
            : 'Google Sheets rejected the append. Verify credentials, access, and destination configuration.',
          retriable,
          ...(providerStatus !== undefined ? { providerStatus } : {}),
          cause: error,
        });
      }

      await dependencies.sleep(delayMs);
      delayMs *= 2;
    }
  }

  throw new ContractSheetsAppendError({
    message: 'Google Sheets append failed unexpectedly.',
    retriable: false,
  });
}
