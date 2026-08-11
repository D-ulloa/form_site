import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContractSheetMappingConfigurationError,
} from '../../src/services/contractSheetHeaderValidation.js';
import { appendContractSheetRow } from '../../src/services/googleSheetsService.js';

test('header preflight reads row 1 and preserves duplicate-label order', async () => {
  const expectedHeaders = ['Nombre Completo', 'DNI', 'Nombre Completo'];
  let headerRequest: unknown;
  let appendCalls = 0;

  await appendContractSheetRow(
    {
      spreadsheetId: 'spreadsheet-id',
      sheetName: "Contracts' East",
      columnHeaders: expectedHeaders,
      row: ['Tenant', '12.345.678', 'Witness'],
    },
    {
      readHeaders: async (request) => {
        headerRequest = request;
        return { data: { values: [expectedHeaders] } };
      },
      execute: async () => {
        appendCalls += 1;
        return { data: { updates: { updatedRange: 'A2:C2' } } };
      },
      sleep: async () => undefined,
    },
  );

  assert.deepEqual(headerRequest, {
    spreadsheetId: 'spreadsheet-id',
    range: "'Contracts'' East'!1:1",
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  assert.equal(appendCalls, 1);
});

test('reordered or missing headers fail before append', async (t) => {
  const expectedHeaders = ['Nombre Completo', 'DNI', 'Nombre Completo'];

  for (const fixture of [
    ['DNI', 'Nombre Completo', 'Nombre Completo'],
    ['Nombre Completo', 'DNI'],
  ]) {
    await t.test(`actual headers: ${fixture.join(' | ')}`, async () => {
      let appendCalls = 0;
      await assert.rejects(
        appendContractSheetRow(
          {
            spreadsheetId: 'spreadsheet-id',
            sheetName: 'Contracts',
            columnHeaders: expectedHeaders,
            row: ['Tenant', '12.345.678', 'Witness'],
          },
          {
            readHeaders: async () => ({ data: { values: [fixture] } }),
            execute: async () => {
              appendCalls += 1;
              return { data: { updates: { updatedRange: 'unexpected' } } };
            },
            sleep: async () => undefined,
          },
        ),
        (error: unknown) => {
          assert.ok(error instanceof ContractSheetMappingConfigurationError);
          assert.equal(error.retriable, false);
          return true;
        },
      );
      assert.equal(appendCalls, 0);
    });
  }
});
