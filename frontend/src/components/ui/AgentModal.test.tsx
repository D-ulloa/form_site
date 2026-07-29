// @vitest-environment jsdom

import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AgentProvider } from '../../app/contexts/AgentContext.tsx';
import { AgentModal } from './AgentModal.tsx';

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function showModal(this: HTMLDialogElement) {
      if (this.open) throw new DOMException('Dialog is already open');
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('AgentModal accessibility', () => {
  it('opens a labelled native modal dialog without axe violations and handles cancel', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <StrictMode>
        <AgentProvider>
          <AgentModal open onClose={onClose} />
        </AgentProvider>
      </StrictMode>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Configurar agente' });
    expect(dialog.getAttribute('aria-describedby')).toBe('agent-modal-description');

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);

    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
