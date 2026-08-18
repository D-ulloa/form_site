import axios from 'axios';
import type {
  InvitationResolution,
  OrganizationInvitationSummary,
  OrganizationMemberSummary,
} from '../types';

const api = axios.create({ baseURL: '/api', withCredentials: true });

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

