// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as axe from 'axe-core';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContractEvidenceFileValue,
  ContractFileReceiverDefinition,
} from '../../src/features/contracts/types.ts';
import { ContractFileReceiver } from '../../src/features/contracts/components/ContractFileReceiver.tsx';

const definition: ContractFileReceiverDefinition = {
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
};

function Harness({ externalError }: { externalError?: string }) {
  const [files, setFiles] = useState<ContractEvidenceFileValue[]>([]);
  return (
    <ContractFileReceiver
      definition={definition}
      files={files}
      onFilesChange={setFiles}
      error={externalError}
      idPrefix="garantes-0"
    />
  );
}

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((file: File) => `blob:${file.name}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SPEC-14 contract evidence file receiver', () => {
  it('exposes the localized label, limits, and exact accepted MIME types', () => {
    render(<Harness />);

    const input = screen.getByLabelText('Subir recibo de sueldo') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe(definition.acceptedMimeTypes.join(','));
    expect(screen.getByText('Hasta 2 archivos — PDF, JPG, PNG')).toBeTruthy();
    expect(screen.queryByText('También se aceptan archivos BMP y TIFF.')).toBeNull();
  });

  it.each([
    ['application/pdf', 'archivo.pdf'],
    ['image/jpeg', 'archivo.jpg'],
    ['image/png', 'archivo.png'],
    ['image/gif', 'archivo.gif'],
    ['image/webp', 'archivo.webp'],
    ['image/bmp', 'archivo.bmp'],
    ['image/tiff', 'archivo.tiff'],
  ])('accepts %s and renders its preview metadata', (mimeType, filename) => {
    render(<Harness />);
    const file = new File(['evidence'], filename, { type: mimeType });

    fireEvent.change(screen.getByLabelText('Subir recibo de sueldo'), {
      target: { files: [file] },
    });

    expect(screen.getByText(filename)).toBeTruthy();
    expect(screen.getByText('8 B')).toBeTruthy();
    if (mimeType.startsWith('image/')) {
      expect(screen.getByRole('img', {
        name: `Vista previa de ${filename}`,
      })).toHaveProperty('src', `blob:${filename}`);
    } else {
      expect(screen.getByLabelText(`Archivo PDF: ${filename}`)).toBeTruthy();
    }
  });

  it('rejects invalid and oversized files with inline Spanish messages', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Subir recibo de sueldo');

    fireEvent.change(input, {
      target: { files: [new File(['x'], 'texto.txt', { type: 'text/plain' })] },
    });
    expect(screen.getByRole('alert').textContent).toContain(
      'texto.txt: tipo de archivo no permitido.',
    );
    expect(screen.queryByRole('button', { name: 'Eliminar texto.txt' })).toBeNull();

    const oversized = new File(['x'], 'grande.pdf', { type: 'application/pdf' });
    Object.defineProperty(oversized, 'size', { value: definition.maxSizeBytes + 1 });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(screen.getByRole('alert').textContent).toContain(
      'grande.pdf: el archivo debe pesar hasta 10.0 MB.',
    );
  });

  it('prevents a third file and preserves the two already selected files', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Subir recibo de sueldo');
    const first = new File(['1'], 'uno.pdf', { type: 'application/pdf' });
    const second = new File(['2'], 'dos.png', { type: 'image/png' });
    const third = new File(['3'], 'tres.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [first, second] } });
    fireEvent.change(input, { target: { files: [third] } });

    expect(screen.getByRole('alert').textContent).toContain(
      'Podés seleccionar hasta 2 archivos.',
    );
    expect(screen.getByText('uno.pdf')).toBeTruthy();
    expect(screen.getByText('dos.png')).toBeTruthy();
    expect(screen.queryByText('tres.jpg')).toBeNull();
  });

  it('removes files, clears local errors, and releases image preview URLs', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Subir recibo de sueldo');
    const image = new File(['image'], 'recibo.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [image] } });
    fireEvent.change(input, {
      target: { files: [new File(['bad'], 'invalido.txt', { type: 'text/plain' })] },
    });
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar recibo.png' }));

    expect(screen.queryByText('recibo.png')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recibo.png');
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<Harness />);
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
