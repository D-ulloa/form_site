// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentProvider } from '../../src/app/contexts/AgentContext.tsx';
import {
  fetchAdminSession,
  loginAdmin,
  registerAdmin,
  startGoogleLogin,
} from '../../src/features/contracts/services/adminAuthApi.ts';
import { ActionSelectionPage } from '../../src/pages/ActionSelectionPage.tsx';
import { AuthPage } from '../../src/pages/AuthPage.tsx';

vi.mock('../../src/features/contracts/services/adminAuthApi.ts', () => ({
  AdminAuthError: class AdminAuthError extends Error {},
  fetchAdminSession: vi.fn(),
  loginAdmin: vi.fn(),
  registerAdmin: vi.fn(),
  startGoogleLogin: vi.fn(),
  logoutAdmin: vi.fn(),
}));

function renderAuth(path: '/login' | '/register') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/" element={<p>Sesión iniciada</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchAdminSession).mockResolvedValue(null);
  vi.mocked(loginAdmin).mockResolvedValue({
    authenticated: true,
    user: { id: 'user-id', email: 'admin@example.test', name: 'Admin' },
  });
  vi.mocked(registerAdmin).mockResolvedValue({
    authenticated: true,
    user: { id: 'user-id', email: 'admin@example.test', name: 'Admin' },
  });
  vi.mocked(startGoogleLogin).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SPEC-19 authentication screens', () => {
  it('renders password login and Google OAuth in the site palette', () => {
    const { container } = renderAuth('/login');

    expect(screen.getByRole('heading', { name: 'Iniciá sesión' })).toBeTruthy();
    expect(screen.getByLabelText(/Correo electrónico/u)).toBeTruthy();
    expect(screen.getByLabelText(/^Contraseña/u)).toBeTruthy();
    expect(screen.getByLabelText('Recordarme en este navegador')).toBeTruthy();
    expect(screen.queryByText(/OPEV-H/iu)).toBeNull();
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeTruthy();
    expect(container.querySelector('main')?.className).toContain('bg-[var(--bg-base)]');
  });

  it('switches to a dedicated registration section with the reference fields', () => {
    renderAuth('/login');
    fireEvent.click(screen.getByRole('link', { name: 'Crear cuenta' }));

    expect(screen.getByRole('heading', { name: 'Creá tu cuenta' })).toBeTruthy();
    expect(screen.getByLabelText(/Nombre completo/u)).toBeTruthy();
    expect(screen.getByLabelText(/Empresa/u)).toBeTruthy();
    expect(screen.getByLabelText(/Cargo o rol/u)).toBeTruthy();
    expect(screen.getByLabelText(/Confirmar contraseña/u)).toBeTruthy();
    expect(screen.queryByLabelText('Recordarme en este navegador')).toBeNull();
  });

  it('rejects mismatched registration passwords before calling the API', () => {
    renderAuth('/register');
    fireEvent.change(screen.getByLabelText(/Nombre completo/u), {
      target: { value: 'Admin Example' },
    });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/u), {
      target: { value: 'admin@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/^Contraseña/u), {
      target: { value: 'first-password' },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/u), {
      target: { value: 'second-password' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Registrarse' }).closest('form')!);

    expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(registerAdmin).not.toHaveBeenCalled();
  });

  it('submits email/password login and redirects to the authenticated entry', async () => {
    renderAuth('/login');
    fireEvent.change(screen.getByLabelText(/Correo electrónico/u), {
      target: { value: 'admin@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/^Contraseña/u), {
      target: { value: 'valid-password' },
    });
    fireEvent.click(screen.getByLabelText('Recordarme en este navegador'));
    fireEvent.submit(screen.getByRole('button', { name: 'Iniciar sesión' }).closest('form')!);

    await waitFor(() => {
      expect(loginAdmin).toHaveBeenCalledWith({
        email: 'admin@example.test',
        password: 'valid-password',
        rememberMe: true,
      });
    });
    expect(await screen.findByText('Sesión iniciada')).toBeTruthy();
  });

  it('starts Google OAuth from the login screen', async () => {
    renderAuth('/login');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));

    await waitFor(() => {
      expect(startGoogleLogin).toHaveBeenCalledOnce();
    });
  });
});

describe('SPEC-19 main entry', () => {
  it('offers registration and login without Google or agent setup', async () => {
    render(
      <AgentProvider>
        <MemoryRouter>
          <ActionSelectionPage />
        </MemoryRouter>
      </AgentProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Registrarse' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(screen.queryByText(/Google/iu)).toBeNull();
    expect(screen.queryByText(/Configurar agente/iu)).toBeNull();
    expect(screen.queryByText(/OPEV-H/iu)).toBeNull();
  });
});
