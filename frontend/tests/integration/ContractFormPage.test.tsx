// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentProvider } from '../../src/app/contexts/AgentContext.tsx';
import {
  fetchContractRoleSchema,
  requestContractEvidenceUploadUrls,
  submitContractRole,
  uploadContractEvidenceFile,
} from '../../src/features/contracts/services/contractApi.ts';
import type {
  ContractRoleSchemaResponse,
} from '../../src/features/contracts/types.ts';
import { ContractFormPage } from '../../src/pages/ContractFormPage.tsx';

vi.mock('../../src/features/contracts/services/contractApi.ts', () => ({
  ContractRequestError: class ContractRequestError extends Error {
    fieldErrors = [];
  },
  fetchContractRoleSchema: vi.fn(),
  requestContractEvidenceUploadUrls: vi.fn(),
  submitContractRole: vi.fn(),
  uploadContractEvidenceFile: vi.fn(),
}));

const entry = {
  entryId: '11111111-1111-4111-8111-111111111111',
  schemaId: 'rent-contract-v1',
  createdBy: 'agent-001',
  createdAt: '2026-07-29T12:00:00.000Z',
  userFilled: false,
  clientFilled: false,
  userSubmittedAt: null,
  clientSubmittedAt: null,
  status: 'open' as const,
  archivedAt: null,
};

const contractSection = {
  title: 'Contrato',
  fields: [
    { name: 'contract_object', label: '1ra. Objeto', type: 'string', required: true },
    { name: 'contract_months', label: 'meses', type: 'number', required: true },
    { name: 'contract_start_date', label: 'Inicio', type: 'date', required: true },
    {
      name: 'contract_formatted_start',
      label: 'Formateada_1',
      type: 'date',
      required: true,
      readOnly: true,
      computed: 'formatted_start',
    },
    { name: 'contract_rent_amount', label: 'Monto alquiler', type: 'number', required: true },
    { name: 'contract_update', label: 'Actualización', type: 'number', required: false },
    {
      name: 'contract_formatted_update',
      label: 'Formateada_2',
      type: 'date',
      required: false,
      readOnly: true,
      computed: 'formatted_update',
    },
    {
      name: 'contract_selection',
      label: 'Ajuste',
      type: 'select',
      required: false,
      options: ['IPC', 'ICL'],
    },
    { name: 'submission_date', label: 'Fecha Actual', type: 'date', required: true },
  ],
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
      fieldNames: ['contract_selection', 'submission_date'],
    },
  ],
} satisfies ContractRoleSchemaResponse['sections'][number];

function renderPage(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/contracts/:entryId/:role"
              element={<ContractFormPage />}
            />
          </Routes>
        </MemoryRouter>
      </AgentProvider>
    </QueryClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.mocked(submitContractRole).mockResolvedValue({
    submissionId: '22222222-2222-4222-8222-222222222222',
    entryId: entry.entryId,
    status: 'open',
    submittedAt: '2026-07-29T12:05:00.000Z',
  });
  vi.mocked(requestContractEvidenceUploadUrls).mockResolvedValue([]);
  vi.mocked(uploadContractEvidenceFile).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe('SPEC-12 hosted contract forms', () => {
  it('shows Propietario and Guardar without exposing the JSON schema', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'user',
      sections: [{
        title: 'Propietario',
        fields: [{
          name: 'witness_full_name',
          label: 'Nombre completo',
          type: 'string',
          required: true,
        }],
      }],
      entry,
      readOnly: false,
      values: {},
    } satisfies ContractRoleSchemaResponse);

    renderPage(`/contracts/${entry.entryId}/user`);

    expect(await screen.findByText('Propietario')).toBeTruthy();
    expect(screen.getByText('Generación de contratos')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy();
    expect(screen.queryByText('Enviar formulario')).toBeNull();
    expect(screen.queryByText('Esquema JSON')).toBeNull();
  });

  it('groups the editable Contrato fields under the three SPEC-13 subdivisions', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'user',
      sections: [contractSection],
      entry,
      readOnly: false,
      values: {},
    } satisfies ContractRoleSchemaResponse);

    renderPage(`/contracts/${entry.entryId}/user`);

    const vigencia = await screen.findByRole('group', { name: 'Vigencia' });
    const canon = screen.getByRole('group', { name: 'Canon' });
    const ajuste = screen.getByRole('group', { name: 'Ajuste' });

    expect(within(vigencia).getByLabelText(/^meses/u)).toBeTruthy();
    expect(within(vigencia).getByLabelText(/^Inicio/u)).toBeTruthy();
    expect(within(vigencia).getByLabelText(/^Formateada_1/u)).toHaveProperty('readOnly', true);
    expect(within(canon).getByLabelText(/^Monto alquiler/u)).toBeTruthy();
    expect(within(canon).getByLabelText('Actualización')).toBeTruthy();
    expect(within(canon).getByLabelText('Formateada_2')).toHaveProperty('readOnly', true);
    expect(within(ajuste).getByLabelText('Ajuste')).toBeTruthy();
    expect(within(ajuste).getByLabelText(/^Fecha Actual/u)).toBeTruthy();

    const contractObject = screen.getByLabelText(/^1ra\. Objeto/u);
    expect(contractObject).toBeTruthy();
    expect(vigencia.contains(contractObject)).toBe(false);
    expect(canon.contains(contractObject)).toBe(false);
    expect(ajuste.contains(contractObject)).toBe(false);
  });

  it('preserves the Contrato subdivisions when a submitted form is read-only', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'user',
      sections: [contractSection],
      entry: { ...entry, userFilled: true },
      readOnly: true,
      values: {
        contract_object: 'Vivienda',
        contract_months: 24,
        contract_start_date: '2026-08-15',
        contract_formatted_start: '2026-07-31',
        contract_rent_amount: 500000,
        contract_update: 6,
        contract_formatted_update: '2027-01-31',
        contract_selection: 'IPC',
        submission_date: '2026-07-29',
      },
    } satisfies ContractRoleSchemaResponse);

    renderPage(`/contracts/${entry.entryId}/user`);

    expect(await screen.findByRole('region', { name: 'Vigencia' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Canon' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Ajuste' })).toBeTruthy();
    expect(screen.getByText('Vivienda')).toBeTruthy();
    expect(screen.getByText('2027-01-31')).toBeTruthy();
  });

  it('offers Editar and reopens a submitted form for correction', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'user',
      sections: [{
        title: 'Propietario',
        fields: [{
          name: 'witness_full_name',
          label: 'Nombre completo',
          type: 'string',
          required: true,
        }],
      }],
      entry: { ...entry, userFilled: true, userSubmittedAt: '2026-07-29T12:05:00.000Z' },
      readOnly: true,
      values: { witness_full_name: 'Juan Pérez' },
    } satisfies ContractRoleSchemaResponse);

    renderPage('/contracts/' + entry.entryId + '/user');

    expect(await screen.findByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(await screen.findByRole('button', { name: 'Guardar' })).toBeTruthy();
    expect((screen.getByLabelText(/^Nombre completo/u) as HTMLInputElement).value).toBe('Juan Pérez');

    fireEvent.change(screen.getByLabelText(/^Nombre completo/u), { target: { value: 'Juan Actualizado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(submitContractRole).toHaveBeenCalledWith(
        entry.entryId,
        'user',
        null,
        { witness_full_name: 'Juan Actualizado' },
        undefined,
      );
    });
  });

  it('blocks a guarantor with both subsections empty and accepts either one', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'client',
      sections: [{
        title: 'Garantes',
        fields: [
          {
            name: 'guarantor_company',
            label: 'Empresa',
            type: 'string',
            required: false,
          },
          {
            name: 'property_type',
            label: 'Tipo de propiedad',
            type: 'string',
            required: false,
          },
        ],
        repeatable: {
          name: 'garantes',
          itemLabel: 'Garante',
          addLabel: 'Agregar Garante',
          minItems: 1,
        },
        subsections: [
          {
            title: 'Recibo de sueldo',
            fieldNames: ['guarantor_company'],
          },
          {
            title: 'Garantía propietaria',
            fieldNames: ['property_type'],
          },
        ],
      }],
      entry,
      readOnly: false,
      values: {},
    } satisfies ContractRoleSchemaResponse);

    renderPage(`/contracts/${entry.entryId}/client?token=client-token`);

    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText(
        'Completá al menos Recibo de sueldo o Garantía propietaria.',
      ),
    ).toBeTruthy();
    expect(submitContractRole).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Empresa'), {
      target: { value: 'Empresa SA' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(submitContractRole).toHaveBeenCalledWith(
        entry.entryId,
        'client',
        'client-token',
        { garantes: [{ guarantor_company: 'Empresa SA' }] },
        undefined,
      );
    });
  });
});

it('SPEC-20 replaces the tenant age input with the majority checkbox and submits its boolean value', async () => {
    const tenantSection: ContractRoleSchemaResponse['sections'][number] = {
      title: 'Inquilino',
      fields: [
        {
          name: 'tenant_full_name',
          label: 'Nombre completo',
          type: 'string',
          required: true,
        },
        {
          name: 'tenant_is_adult',
          label: 'Soy mayor de edad',
          type: 'boolean',
          required: true,
        },
      ],
      repeatable: {
        name: 'inquilinos',
        itemLabel: 'Inquilino',
        addLabel: 'Agregar Inquilino',
        minItems: 1,
      },
    };
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'client',
      sections: [tenantSection],
      entry,
      readOnly: false,
      values: {},
    });

    renderPage('/contracts/' + entry.entryId + '/client?token=client-token');

    const majorityCheckbox = await screen.findByRole('checkbox', { name: 'Soy mayor de edad' });
    expect(majorityCheckbox).toHaveProperty('checked', false);
    expect(screen.queryByLabelText('Edad')).toBeNull();

    fireEvent.change(screen.getByLabelText(/^Nombre completo/u), {
      target: { value: 'Inquilino, Ignacio' },
    });
    fireEvent.click(majorityCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(submitContractRole).toHaveBeenCalledWith(
        entry.entryId,
        'client',
        'client-token',
        {
          inquilinos: [{
            tenant_full_name: 'Inquilino, Ignacio',
            tenant_is_adult: true,
          }],
        },
        undefined,
      );
    });
  });

describe('SPEC-14 guarantor evidence uploads', () => {
  const evidenceSection: ContractRoleSchemaResponse['sections'][number] = {
    title: 'Garantes',
    fields: [
      {
        name: 'guarantor_company',
        label: 'Empresa',
        type: 'string',
        required: false,
      },
      {
        name: 'property_type',
        label: 'Tipo de propiedad',
        type: 'string',
        required: false,
      },
    ],
    repeatable: {
      name: 'garantes',
      itemLabel: 'Garante',
      addLabel: 'Agregar Garante',
      minItems: 1,
    },
    uploads: [
      {
        name: 'guarantor_dni_front_image',
        label: 'Frente DNI',
        slot: 'front',
        required: false,
      },
      {
        name: 'guarantor_dni_back_image',
        label: 'Dorso DNI',
        slot: 'back',
        required: false,
      },
    ],
    subsections: [
      {
        title: 'Recibo de sueldo',
        fieldNames: ['guarantor_company'],
        fileReceivers: [{
          name: 'recibo_sueldo_files',
          label: 'Subir recibo de sueldo',
          maxFiles: 2,
          maxSizeBytes: 10 * 1024 * 1024,
          acceptedMimeTypes: [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/bmp',
            'image/tiff',
          ],
        }],
      },
      {
        title: 'Garantía propietaria',
        fieldNames: ['property_type'],
        fileReceivers: [{
          name: 'garantia_propietaria_files',
          label: 'Subir garantía propietaria',
          maxFiles: 2,
          maxSizeBytes: 10 * 1024 * 1024,
          acceptedMimeTypes: [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/bmp',
            'image/tiff',
          ],
        }],
      },
    ],
  };

  it('blocks an empty evidence pair, uploads only on Guardar, and submits stable refs', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'client',
      sections: [evidenceSection],
      entry,
      readOnly: false,
      values: {},
    });
    vi.mocked(requestContractEvidenceUploadUrls).mockResolvedValue([{
      filename: 'recibo.pdf',
      mimeType: 'application/pdf',
      size: 7,
      storagePath: `${entry.entryId}/garantes/0/recibo_sueldo_files/recibo.pdf`,
      storageBucket: 'contract-evidence',
      uploadUrl: 'https://storage.example.test/upload/recibo',
    }]);

    renderPage(`/contracts/${entry.entryId}/client?token=client-token`);

    fireEvent.change(await screen.findByLabelText('Empresa'), {
      target: { value: 'Empresa SA' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(
      'Adjuntá al menos un archivo en Recibo de sueldo o Garantía propietaria.',
    )).toBeTruthy();
    expect(submitContractRole).not.toHaveBeenCalled();
    expect(requestContractEvidenceUploadUrls).not.toHaveBeenCalled();

    const file = new File(['recibo!'], 'recibo.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Subir recibo de sueldo'), {
      target: { files: [file] },
    });

    expect(requestContractEvidenceUploadUrls).not.toHaveBeenCalled();
    expect(uploadContractEvidenceFile).not.toHaveBeenCalled();
    expect(submitContractRole).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText(
        'Adjuntá al menos un archivo en Recibo de sueldo o Garantía propietaria.',
      )).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar recibo.pdf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(
      'Adjuntá al menos un archivo en Recibo de sueldo o Garantía propietaria.',
    )).toBeTruthy();
    expect(requestContractEvidenceUploadUrls).not.toHaveBeenCalled();
    expect(submitContractRole).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Subir recibo de sueldo'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(requestContractEvidenceUploadUrls).toHaveBeenCalledWith(
        entry.entryId,
        'client-token',
        [{
          collection: 'garantes',
          itemIndex: 0,
          field: 'recibo_sueldo_files',
          filename: 'recibo.pdf',
          mimeType: 'application/pdf',
          size: 7,
        }],
        undefined,
      );
    });
    expect(uploadContractEvidenceFile).toHaveBeenCalledWith(
      file,
      'https://storage.example.test/upload/recibo',
    );
    await waitFor(() => {
      expect(submitContractRole).toHaveBeenCalledWith(
        entry.entryId,
        'client',
        'client-token',
        {
          garantes: [{
            guarantor_company: 'Empresa SA',
            recibo_sueldo_files: [{
              filename: 'recibo.pdf',
              mimeType: 'application/pdf',
              size: 7,
              storagePath: `${entry.entryId}/garantes/0/recibo_sueldo_files/recibo.pdf`,
              storageBucket: 'contract-evidence',
            }],
          }],
        },
        undefined,
      );
    });
  });

  it('locks every editable control while evidence presigning is pending', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'client',
      sections: [evidenceSection],
      entry,
      readOnly: false,
      values: {},
    });
    const presign = deferred<Awaited<ReturnType<
      typeof requestContractEvidenceUploadUrls
    >>>();
    vi.mocked(requestContractEvidenceUploadUrls).mockReturnValue(presign.promise);
    const file = new File(['proof'], 'proof.pdf', { type: 'application/pdf' });

    renderPage(`/contracts/${entry.entryId}/client?token=client-token`);
    fireEvent.change(await screen.findByLabelText('Empresa'), {
      target: { value: 'Empresa SA' },
    });
    fireEvent.change(screen.getByLabelText('Subir recibo de sueldo'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(requestContractEvidenceUploadUrls).toHaveBeenCalledTimes(1);
    });
    const lockedFields = screen.getByRole('group', { name: 'Datos del formulario' });
    expect(within(lockedFields).getByLabelText('Empresa').matches(':disabled')).toBe(true);
    expect(
      within(lockedFields).getByRole('button', { name: 'Agregar Garante' })
        .matches(':disabled'),
    ).toBe(true);
    expect(
      within(lockedFields).getByLabelText('Subir recibo de sueldo')
        .matches(':disabled'),
    ).toBe(true);
    expect(
      within(lockedFields).getByLabelText('Frente DNI').matches(':disabled'),
    ).toBe(true);
    expect(
      within(lockedFields).getByRole('button', { name: 'Eliminar proof.pdf' })
        .matches(':disabled'),
    ).toBe(true);

    presign.resolve([{
      filename: 'proof.pdf',
      mimeType: 'application/pdf',
      size: 5,
      storagePath: `${entry.entryId}/garantes/0/recibo_sueldo_files/proof.pdf`,
      storageBucket: 'contract-evidence',
      uploadUrl: 'https://storage.example.test/upload/proof',
    }]);
    await waitFor(() => {
      expect(submitContractRole).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps uploaded refs after a final-submit failure and retries without reuploading', async () => {
    const editableSchema: ContractRoleSchemaResponse = {
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'client',
      sections: [evidenceSection],
      entry,
      readOnly: false,
      values: {},
    };
    vi.mocked(fetchContractRoleSchema).mockResolvedValue(editableSchema);
    vi.mocked(requestContractEvidenceUploadUrls).mockResolvedValue([{
      filename: 'recibo.pdf',
      mimeType: 'application/pdf',
      size: 5,
      storagePath: `${entry.entryId}/garantes/0/recibo_sueldo_files/recibo.pdf`,
      storageBucket: 'contract-evidence',
      uploadUrl: 'https://storage.example.test/upload/recibo',
    }]);
    vi.mocked(submitContractRole)
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        submissionId: '22222222-2222-4222-8222-222222222222',
        entryId: entry.entryId,
        status: 'open',
        submittedAt: '2026-07-29T12:05:00.000Z',
      });
    const file = new File(['proof'], 'recibo.pdf', { type: 'application/pdf' });

    renderPage(`/contracts/${entry.entryId}/client?token=client-token`);
    fireEvent.change(await screen.findByLabelText('Empresa'), {
      target: { value: 'Empresa SA' },
    });
    fireEvent.change(screen.getByLabelText('Subir recibo de sueldo'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(
      'No se pudo confirmar el guardado. Verificamos el estado y podés intentar nuevamente.',
    )).toBeTruthy();
    expect(fetchContractRoleSchema).toHaveBeenCalledTimes(2);
    expect(screen.getByText('recibo.pdf')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      expect(submitContractRole).toHaveBeenCalledTimes(2);
    });
    expect(requestContractEvidenceUploadUrls).toHaveBeenCalledTimes(1);
    expect(uploadContractEvidenceFile).toHaveBeenCalledTimes(1);
    expect(submitContractRole).toHaveBeenLastCalledWith(
      entry.entryId,
      'client',
      'client-token',
      {
        garantes: [{
          guarantor_company: 'Empresa SA',
          recibo_sueldo_files: [{
            filename: 'recibo.pdf',
            mimeType: 'application/pdf',
            size: 5,
            storagePath: `${entry.entryId}/garantes/0/recibo_sueldo_files/recibo.pdf`,
            storageBucket: 'contract-evidence',
          }],
        }],
      },
      undefined,
    );
  });

  it('reconciles an ambiguous final response when the server already stored the form', async () => {
    const storedReference = {
      filename: 'recibo.pdf',
      mimeType: 'application/pdf',
      size: 5,
      storagePath: `${entry.entryId}/garantes/0/recibo_sueldo_files/recibo.pdf`,
      storageBucket: 'contract-evidence',
    };
    vi.mocked(fetchContractRoleSchema)
      .mockResolvedValueOnce({
        schemaId: 'rent-contract-v1',
        contractType: 'rent-contract-v1',
        role: 'client',
        sections: [evidenceSection],
        entry,
        readOnly: false,
        values: {},
      })
      .mockResolvedValueOnce({
        schemaId: 'rent-contract-v1',
        contractType: 'rent-contract-v1',
        role: 'client',
        sections: [evidenceSection],
        entry: { ...entry, clientFilled: true },
        readOnly: true,
        values: {
          garantes: [{
            guarantor_company: 'Empresa SA',
            recibo_sueldo_files: [storedReference],
          }],
        },
      });
    vi.mocked(requestContractEvidenceUploadUrls).mockResolvedValue([{
      ...storedReference,
      uploadUrl: 'https://storage.example.test/upload/recibo',
    }]);
    vi.mocked(submitContractRole).mockRejectedValueOnce(new Error('response lost'));
    const file = new File(['proof'], 'recibo.pdf', { type: 'application/pdf' });

    renderPage(`/contracts/${entry.entryId}/client?token=client-token`);
    fireEvent.change(await screen.findByLabelText('Empresa'), {
      target: { value: 'Empresa SA' },
    });
    fireEvent.change(screen.getByLabelText('Subir recibo de sueldo'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(
      'El formulario ya había sido recibido y se actualizó a modo de solo lectura.',
    )).toBeTruthy();
    expect(screen.queryByText('Solo lectura')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
  });

  it('validates every guarantor independently and preserves opposite receiver indexes', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'client',
      sections: [evidenceSection],
      entry,
      readOnly: false,
      values: {},
    });
    const salaryFile = new File(['salary'], 'salary.pdf', {
      type: 'application/pdf',
    });
    const propertyFile = new File(['deed'], 'deed.png', { type: 'image/png' });
    const salaryReference = {
      filename: 'salary.pdf',
      mimeType: 'application/pdf',
      size: 6,
      storagePath: `${entry.entryId}/garantes/0/recibo_sueldo_files/salary.pdf`,
      storageBucket: 'contract-evidence',
      uploadUrl: 'https://storage.example.test/upload/salary',
    };
    const propertyReference = {
      filename: 'deed.png',
      mimeType: 'image/png',
      size: 4,
      storagePath: `${entry.entryId}/garantes/1/garantia_propietaria_files/deed.png`,
      storageBucket: 'contract-evidence',
      uploadUrl: 'https://storage.example.test/upload/deed',
    };
    vi.mocked(requestContractEvidenceUploadUrls).mockResolvedValue([
      salaryReference,
      propertyReference,
    ]);

    renderPage(`/contracts/${entry.entryId}/client?token=client-token`);
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Garante' }));
    const companies = screen.getAllByLabelText('Empresa');
    const propertyTypes = screen.getAllByLabelText('Tipo de propiedad');
    const salaryInputs = screen.getAllByLabelText('Subir recibo de sueldo');
    const propertyInputs = screen.getAllByLabelText('Subir garantía propietaria');
    fireEvent.change(companies[0] as HTMLElement, {
      target: { value: 'Empresa Uno' },
    });
    fireEvent.change(propertyTypes[1] as HTMLElement, {
      target: { value: 'Casa' },
    });
    fireEvent.change(salaryInputs[0] as HTMLElement, {
      target: { files: [salaryFile] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(
      'Adjuntá al menos un archivo en Recibo de sueldo o Garantía propietaria.',
    )).toBeTruthy();
    expect(requestContractEvidenceUploadUrls).not.toHaveBeenCalled();

    fireEvent.change(propertyInputs[1] as HTMLElement, {
      target: { files: [propertyFile] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(requestContractEvidenceUploadUrls).toHaveBeenCalledWith(
        entry.entryId,
        'client-token',
        [{
          collection: 'garantes',
          itemIndex: 0,
          field: 'recibo_sueldo_files',
          filename: 'salary.pdf',
          mimeType: 'application/pdf',
          size: 6,
        }, {
          collection: 'garantes',
          itemIndex: 1,
          field: 'garantia_propietaria_files',
          filename: 'deed.png',
          mimeType: 'image/png',
          size: 4,
        }],
        undefined,
      );
    });
    await waitFor(() => {
      expect(submitContractRole).toHaveBeenCalledWith(
        entry.entryId,
        'client',
        'client-token',
        {
          garantes: [{
            guarantor_company: 'Empresa Uno',
            recibo_sueldo_files: [{
              filename: salaryReference.filename,
              mimeType: salaryReference.mimeType,
              size: salaryReference.size,
              storagePath: salaryReference.storagePath,
              storageBucket: salaryReference.storageBucket,
            }],
          }, {
            property_type: 'Casa',
            garantia_propietaria_files: [{
              filename: propertyReference.filename,
              mimeType: propertyReference.mimeType,
              size: propertyReference.size,
              storagePath: propertyReference.storagePath,
              storageBucket: propertyReference.storageBucket,
            }],
          }],
        },
        undefined,
      );
    });
  });

  it('renders stored evidence metadata under its subsection in read-only mode', async () => {
    vi.mocked(fetchContractRoleSchema).mockResolvedValue({
      schemaId: 'rent-contract-v1',
      contractType: 'rent-contract-v1',
      role: 'client',
      sections: [evidenceSection],
      entry: { ...entry, clientFilled: true },
      readOnly: true,
      values: {
        garantes: [{
          guarantor_company: 'Empresa SA',
          recibo_sueldo_files: [{
            filename: 'recibo-julio.pdf',
            mimeType: 'application/pdf',
            size: 2048,
            storagePath: 'private/path/recibo-julio.pdf',
            storageBucket: 'contract-evidence',
          }],
        }],
      },
    });

    renderPage(`/contracts/${entry.entryId}/client?token=client-token`);

    const salary = await screen.findByRole('region', { name: 'Recibo de sueldo' });
    expect(within(salary).getByText('recibo-julio.pdf')).toBeTruthy();
    expect(within(salary).getByText('2.0 KB')).toBeTruthy();
    expect(screen.queryByText('private/path/recibo-julio.pdf')).toBeNull();
  });
});
