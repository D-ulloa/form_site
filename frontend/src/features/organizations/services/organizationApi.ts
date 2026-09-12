import axios from 'axios';
import type {
  InvitationResolution,
  ManualInvitationReceipt,
  OrganizationInvitationSummary,
  OrganizationMemberSummary,
  OrganizationRole,
} from '../types';

const API_PREFIX = import.meta.env.DEV ? '' : '/_/backend';
const api = axios.create({ baseURL: `${API_PREFIX}/api`, withCredentials: true });
api.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase() ?? 'GET';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const match = document.cookie.split(';').map((value) => value.trim())
      .find((value) => value.startsWith('form_site_csrf='));
    if (match) config.headers.set('X-CSRF-Token', decodeURIComponent(match.slice('form_site_csrf='.length)));
  }
  return config;
});

export async function createOrganizationInvitation(
  organizationId: string,
  input: { readonly email: string; readonly intended_role: Exclude<OrganizationRole, 'owner'> },
): Promise<ManualInvitationReceipt> {
  const response = await api.post(`/organizations/${organizationId}/invitations`, input);
  return response.data as ManualInvitationReceipt;
}

export async function establishInvitationHandoff(invitationToken: string): Promise<void> {
  await api.post('/invitations/handoff', { invitation_token: invitationToken });
}

export async function resolveInvitation(): Promise<InvitationResolution> {
  const response = await api.post<InvitationResolution>('/invitations/resolve');
  return response.data;
}

export async function acceptInvitation(): Promise<{ organization_id: string; organization_slug: string }> {
  const response = await api.post<{ organization_id: string; organization_slug: string }>('/invitations/accept');
  return response.data;
}

export async function registerInvitationAccount(input: { readonly display_name: string; readonly password: string }): Promise<void> {
  try {
    await api.post('/invitations/register', input);
  } catch (error) {
    const code = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
    const messages: Record<string, string> = {
      PASSWORD_POLICY_REJECTED: 'La contraseña no cumple la política de seguridad. Elegí una contraseña más fuerte y diferente.',
      ACCOUNT_ALREADY_ACTIVATED: 'Tu cuenta ya está activada. Iniciá sesión con tu contraseña para continuar con la invitación.',
      INVITATION_INVALID: 'La invitación o su sesión ya no está disponible. Volvé a abrir el enlace original.',
      INVALID_REQUEST: 'Ingresá un nombre de 2 a 120 caracteres y una contraseña de al menos 12 caracteres.',
      RATE_LIMITED: 'Hubo demasiados intentos. Esperá antes de volver a intentarlo.',
      SESSION_LIMIT_REACHED: 'Alcanzaste el límite de sesiones activas. Cerrá una sesión antes de continuar.',
    };
    // The Axios error retains the submitted password in its request configuration.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(messages[code] ?? 'No se pudo completar la activación de la cuenta. Intentá nuevamente en unos minutos.');
  }
}

export async function resendOrganizationInvitation(organizationId: string, invitationId: string) {
  return (await api.post(`/organizations/${organizationId}/invitations/${invitationId}/resend`)).data;
}

export async function rotateOrganizationInvitationLink(
  organizationId: string,
  invitationId: string,
): Promise<ManualInvitationReceipt> {
  return (await api.post(`/organizations/${organizationId}/invitations/${invitationId}/rotate-link`)).data as ManualInvitationReceipt;
}

export async function revokeOrganizationInvitation(organizationId: string, invitationId: string) {
  return (await api.post(`/organizations/${organizationId}/invitations/${invitationId}/revoke`)).data;
}

export async function listOrganizationMembers(
  organizationId: string,
  cursor?: string,
): Promise<{ items: OrganizationMemberSummary[]; next_cursor: string | null }> {
  const response = await api.get(`/organizations/${organizationId}/members`, {
    params: cursor ? { cursor } : undefined,
  });
  return response.data as { items: OrganizationMemberSummary[]; next_cursor: string | null };
}

export async function listOrganizationInvitations(
  organizationId: string,
  cursor?: string,
): Promise<{ items: OrganizationInvitationSummary[]; next_cursor: string | null }> {
  const response = await api.get(`/organizations/${organizationId}/invitations`, {
    params: cursor ? { cursor } : undefined,
  });
  return response.data as { items: OrganizationInvitationSummary[]; next_cursor: string | null };
}
