export interface ContractSheetHeaderReadInput {
  readonly spreadsheetId: string;
  readonly sheetName: string;
}

export interface ContractSheetHeaderReadRequest {
  readonly spreadsheetId: string;
  readonly range: string;
  readonly majorDimension: 'ROWS';
  readonly valueRenderOption: 'FORMATTED_VALUE';
}

export interface ContractSheetHeaderReadResponse {
  readonly data?: {
    readonly values?: readonly (readonly unknown[])[] | null;
  } | null;
}

export type ContractSheetHeaderReadExecutor = (
  request: ContractSheetHeaderReadRequest,
) => Promise<ContractSheetHeaderReadResponse>;

export class ContractSheetMappingConfigurationError extends Error {
  readonly retriable = false;
  readonly expectedHeaders: readonly string[];
  readonly actualHeaders: readonly string[];

  constructor(
    expectedHeaders: readonly string[],
    actualHeaders: readonly string[],
  ) {
    const mismatchIndex = expectedHeaders.findIndex(
      (header, index) => actualHeaders[index] !== header,
    );
    const firstMismatch = mismatchIndex >= 0
      ? ` First mismatch at column ${mismatchIndex + 1}: expected "${expectedHeaders[mismatchIndex]}", received "${actualHeaders[mismatchIndex] ?? '(missing)'}".`
      : '';
    super(
      `Contract Sheet headers do not match the registered schema (${expectedHeaders.length} expected, ${actualHeaders.length} received).${firstMismatch} Update the configured tab headers before retrying.`,
    );
    this.name = 'ContractSheetMappingConfigurationError';
    this.expectedHeaders = [...expectedHeaders];
    this.actualHeaders = [...actualHeaders];
  }
}

export function buildContractSheetHeaderReadRequest(
  input: ContractSheetHeaderReadInput,
): ContractSheetHeaderReadRequest {
  const quotedSheetName = `'${input.sheetName.replace(/'/gu, "''")}'`;
  return {
    spreadsheetId: input.spreadsheetId,
    range: `${quotedSheetName}!1:1`,
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
  };
}

export function assertContractSheetHeaders(
  expectedHeaders: readonly string[],
  response: ContractSheetHeaderReadResponse,
): void {
  const row = response.data?.values?.[0] ?? [];
  const actualHeaders = row.map((value) =>
    typeof value === 'string' ? value : String(value ?? ''),
  );
  const matches =
    actualHeaders.length === expectedHeaders.length &&
    expectedHeaders.every((header, index) => actualHeaders[index] === header);

  if (!matches) {
    throw new ContractSheetMappingConfigurationError(
      expectedHeaders,
      actualHeaders,
    );
  }
}
