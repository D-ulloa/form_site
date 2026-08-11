// @vitest-environment jsdom

import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContractEvidencePresignedUpload,
  ContractEvidenceUploadDescriptor,
} from '../../src/features/contracts/types.ts';
import {
  requestContractEvidenceUploadUrls,
  uploadContractEvidenceFile,
} from '../../src/features/contracts/services/contractApi.ts';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    isAxiosError: vi.fn(() => false),
  },
}));

const mockedAxios = vi.mocked(axios);

function descriptor(index: number): ContractEvidenceUploadDescriptor {
  return {
    collection: 'garantes',
    itemIndex: Math.floor(index / 4),
    field: index % 2 === 0
      ? 'recibo_sueldo_files'
      : 'garantia_propietaria_files',
    filename: `archivo-${index}.pdf`,
    mimeType: 'application/pdf',
    size: index + 1,
  };
}

function presigned(
  upload: ContractEvidenceUploadDescriptor,
): ContractEvidencePresignedUpload {
  return {
    filename: upload.filename,
    mimeType: upload.mimeType,
    size: upload.size,
    storagePath: `entry/${upload.filename}`,
    storageBucket: 'contract-evidence',
    uploadUrl: `https://storage.example.test/${upload.filename}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SPEC-14 evidence upload API', () => {
  it('presigns more than 20 files in ordered batches', async () => {
    const descriptors = Array.from({ length: 21 }, (_, index) => descriptor(index));
    mockedAxios.post
      .mockResolvedValueOnce({
        data: { uploads: descriptors.slice(0, 20).map(presigned) },
      })
      .mockResolvedValueOnce({
        data: { uploads: descriptors.slice(20).map(presigned) },
      });

    const result = await requestContractEvidenceUploadUrls(
      '11111111-1111-4111-8111-111111111111',
      'client-token',
      descriptors,
    );

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedAxios.post.mock.calls[0]?.[1]).toEqual({
      uploads: descriptors.slice(0, 20),
    });
    expect(mockedAxios.post.mock.calls[1]?.[1]).toEqual({
      uploads: descriptors.slice(20),
    });
    expect(result.map((upload) => upload.filename)).toEqual(
      descriptors.map((upload) => upload.filename),
    );
  });

  it('uploads the selected file with its MIME type and without upsert', async () => {
    mockedAxios.put.mockResolvedValue({ status: 200 });
    const file = new File(['proof'], 'proof.pdf', { type: 'application/pdf' });

    await uploadContractEvidenceFile(
      file,
      'https://storage.example.test/upload/proof',
    );

    expect(mockedAxios.put).toHaveBeenCalledWith(
      'https://storage.example.test/upload/proof',
      file,
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/pdf',
          'x-upsert': 'false',
        },
      }),
    );
  });
});
