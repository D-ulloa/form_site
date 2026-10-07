// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewPropertyPage } from '../../src/pages/NewPropertyPage.tsx';

const mocks = vi.hoisted(() => ({ presign: vi.fn(), upload: vi.fn(), payload: vi.fn(), mutate: vi.fn() }));
vi.mock('../../src/app/contexts/AuthenticationContext.tsx', () => ({
  useAuthentication: () => ({ session: { user: { id: 'worker', name: 'Ana', email: 'worker@example.test' } } }),
}));
vi.mock('../../src/app/contexts/OrganizationContext.tsx', () => ({
  useOrganization: () => ({ organization: { slug: 'azar' } }),
}));
vi.mock('../../src/features/properties/hooks/usePropertyForm.ts', () => ({
  usePropertyForm: () => ({ setValue: vi.fn(), formState: { errors: {}, isSubmitted: false },
    handleSubmit: (valid: (values: object) => Promise<void>) => async (event: { preventDefault: () => void }) => {
      event.preventDefault(); await valid({});
    },
  }),
}));
vi.mock('../../src/features/properties/hooks/useMediaValidation.ts', () => ({
  useMediaValidation: () => ({ isValid: true, files: [{ file: new File(['image'], 'photo.png', { type: 'image/png' }) }],
    handleFilesChange: vi.fn(), setCoverFileName: vi.fn(),
  }),
}));
vi.mock('../../src/features/properties/hooks/useCreatePropertySubmission.ts', () => ({
  useCreatePropertySubmission: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock('../../src/features/properties/services/propertyApi.ts', () => ({
  getMediaUploadProvider: () => 'supabase', requestMediaUploadUrls: mocks.presign,
  uploadFileToSupabase: mocks.upload, buildMediaMetadataFromPresigned: () => ({ original_name: 'photo.png' }),
}));
vi.mock('../../src/features/properties/services/payloadMapper.ts', () => ({
  buildPropertySubmitPayload: mocks.payload, buildFormData: vi.fn(),
}));
vi.mock('../../src/features/properties/components/BasicInfoSection.tsx', () => ({ BasicInfoSection: () => null }));
vi.mock('../../src/features/properties/components/LocationSection.tsx', () => ({ LocationSection: () => null }));
vi.mock('../../src/features/properties/components/DistributionSection.tsx', () => ({ DistributionSection: () => null }));
vi.mock('../../src/features/properties/components/FeaturesSection.tsx', () => ({ FeaturesSection: () => null }));
vi.mock('../../src/features/properties/components/AdditionalDetailsSection.tsx', () => ({ AdditionalDetailsSection: () => null }));
vi.mock('../../src/features/properties/components/MediaUploadSection.tsx', () => ({ MediaUploadSection: () => null }));

const presigned = { upload_session_id: 'upload-session', media_uploads: [{ originalName: 'photo.png',
  uploadUrl: 'https://storage.example.test/upload', storagePath: 'properties/photo.png',
  storageBucket: 'property-media', publicPath: 'property-media/properties/photo.png' }] };

function startUpload() {
  const view = render(<MemoryRouter><NewPropertyPage /></MemoryRouter>);
  fireEvent.submit(view.container.querySelector('form')!);
  return view;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.presign.mockResolvedValue(presigned);
  mocks.upload.mockResolvedValue(undefined);
  mocks.payload.mockReturnValue({ media_uploads: [{ original_name: 'photo.png' }] });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Property uploads abandoned by login redirects', () => {
  it('aborts a pending preflight and ignores its late success after the form closes', async () => {
    let finish!: (value: typeof presigned) => void;
    mocks.presign.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = startUpload();
    const signal = mocks.presign.mock.calls[0][2] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { finish(presigned); });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('aborts an in-progress file upload and prevents a later property submission', async () => {
    let finish!: () => void;
    mocks.upload.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const view = startUpload();
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
    const signal = mocks.upload.mock.calls[0][3] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { finish(); });
    expect(mocks.payload).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('allows a completed media upload to proceed to property submission while the form stays open', async () => {
    startUpload();
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledOnce());
    expect(mocks.upload.mock.calls[0][3]).toBe(mocks.presign.mock.calls[0][2]);
    expect((mocks.presign.mock.calls[0][2] as AbortSignal).aborted).toBe(false);
  });
});
