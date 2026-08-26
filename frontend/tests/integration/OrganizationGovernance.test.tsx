// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationGovernancePanel } from '../../src/features/organizations/components/OrganizationGovernancePanel.tsx';
import {
  acceptInvitation,
  establishInvitationHandoff,
  resolveInvitation,
} from '../../src/features/organizations/services/organizationApi.ts';
import { InvitationAcceptPage } from '../../src/pages/InvitationAcceptPage.tsx';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/features/organizations/services/organizationApi.ts', () => ({
  resolveInvitation: vi.fn(),
  establishInvitationHandoff: vi.fn(),
  acceptInvitation: vi.fn(),
}));
vi.mock('../../src/app/contexts/AuthenticationContext.tsx', () => ({
  useAuthentication: () => ({ status: 'authenticated', session: {}, refresh: vi.fn(), logout: vi.fn() }),
}));

beforeEach(() => {
  vi.mocked(resolveInvitation).mockResolvedValue({
    organization_display_name: 'Solar',
    email_masked: 'm***@example.test',
    intended_role: 'member',
    expires_at: '2026-08-21T12:00:00.000Z',
  });
  vi.mocked(establishInvitationHandoff).mockResolvedValue();
  vi.mocked(acceptInvitation).mockResolvedValue({ organization_id: 'solar-id', organization_slug: 'solar' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('SPEC-26 invitation acceptance', () => {
  it('reads the token from the fragment, removes it immediately, and passes it only in memory', async () => {
    window.history.replaceState(null, '', '/invitations/accept#invitation_token=single-use-secret');
    render(<MemoryRouter><InvitationAcceptPage /></MemoryRouter>);

    await waitFor(() => expect(establishInvitationHandoff).toHaveBeenCalledWith('single-use-secret'));
    expect(resolveInvitation).toHaveBeenCalledWith();
    expect(window.location.hash).toBe('');
    expect(document.body.textContent).not.toContain('single-use-secret');
    expect(screen.getByText(/Te invitaron a/u).textContent).toContain('Solar');

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith());
    expect(await screen.findByText(/fue aceptada/u)).toBeTruthy();
  });

  it('uses one generic invalid state when no token is present', async () => {
    vi.mocked(resolveInvitation).mockRejectedValueOnce(new Error('invalid'));
    window.history.replaceState(null, '', '/invitations/accept');
    render(<MemoryRouter><InvitationAcceptPage /></MemoryRouter>);
    expect(await screen.findByText(/no es válida o ya no está disponible/u)).toBeTruthy();
    expect(resolveInvitation).toHaveBeenCalledWith();
  });
});

describe('SPEC-26 governance controls', () => {
  it('limits an administrator invite form to member and viewer roles', () => {
    render(<OrganizationGovernancePanel
      section="invitations"
      context={{
        organization_id: 'azar-id', organization_slug: 'azar', display_name: 'Azar',
        status: 'active', plan_key: 'internal', role: 'admin',
        capabilities: ['organization.read', 'members.read', 'members.invite'],
      }}
      onInvite={vi.fn()}
    />);
    expect(screen.getByLabelText(/Correo electrónico/u)).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Miembro' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Lector' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Administrador' })).toBeNull();
  });

  it('communicates suspended state in text and disables unavailable lifecycle actions', () => {
    render(<OrganizationGovernancePanel
      section="lifecycle"
      context={{
        organization_id: 'solar-id', organization_slug: 'solar', display_name: 'Solar',
        status: 'suspended', plan_key: 'standard', role: 'owner',
        capabilities: ['organization.read', 'organization.export'],
      }}
    />);
    expect(screen.getByRole('status').textContent).toContain('suspended');
    expect(screen.getByRole('button', { name: 'Solicitar exportación' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Solicitar eliminación' }).hasAttribute('disabled')).toBe(true);
  });
});
