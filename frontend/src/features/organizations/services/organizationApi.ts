import axios from 'axios';
import type {
  InvitationResolution,
  OrganizationInvitationSummary,
  OrganizationMemberSummary,
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
  input: { readonly email: string; readonly intended_role: 'admin' | 'member' | 'viewer' },
): Promise<{ readonly invitation_id: string }> {
  const response = await api.post(`/organizations/${organizationId}/invitations`, input);
  return response.data as { invitation_id: string };
}

export async function resolveInvitation(invitationToken: string): Promise<InvitationResolution> {
  const response = await api.post<InvitationResolution>('/invitations/resolve', {
    invitation_token: invitationToken,
  });
  return response.data;
}

export async function acceptInvitation(invitationToken: string): Promise<{ organization_id: string }> {
  const response = await api.post<{ organization_id: string }>('/invitations/accept', {
    invitation_token: invitationToken,
  });
  return response.data;
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
