// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentProvider } from '../../src/app/contexts/AgentContext.tsx';
import { AuthenticationProvider } from '../../src/app/contexts/AuthenticationContext.tsx';
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
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/" element={<p>Sesión iniciada</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
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

  it('closes direct registration without calling the account API', () => {
    renderAuth('/register');
    expect(screen.getByRole('heading', { name: 'El registro está cerrado' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toBeTruthy();
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
  it('offers only reviewed-account login without agent setup', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AgentProvider>
          <MemoryRouter><AuthenticationProvider><ActionSelectionPage /></AuthenticationProvider></MemoryRouter>
        </AgentProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Registrarse' })).toBeNull();
    expect(screen.queryByText(/Google/iu)).toBeNull();
    expect(screen.queryByText(/Configurar agente/iu)).toBeNull();
    expect(screen.queryByText(/OPEV-H/iu)).toBeNull();
  });

  it('requires an explicit organization selection before tenant actions render', async () => {
    vi.mocked(fetchAdminSession).mockResolvedValue({
      authenticated: true,
      user: { id: 'admin-id', email: 'admin@example.test', name: 'Admin' },
      memberships: [{ organization_id: '20000000-0000-4000-8000-000000000001', organization_slug: 'azar',
        organization_display_name: 'Azar', organization_status: 'active',
        membership_id: '30000000-0000-4000-8000-000000000001', membership_status: 'active',
        role: 'owner', capabilities: ['contracts.manage'] }],
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AgentProvider>
          <MemoryRouter initialEntries={['/']}><AuthenticationProvider>
            <Routes>
              <Route path="/" element={<ActionSelectionPage />} />
              <Route path="/t/azar" element={<p>Contexto Azar</p>} />
            </Routes>
          </AuthenticationProvider></MemoryRouter>
        </AgentProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Elegí una organización' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Azar · owner' }));
    expect(await screen.findByText('Contexto Azar')).toBeTruthy();
  });
});
