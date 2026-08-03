import axios from 'axios';

const API_PREFIX = import.meta.env.DEV ? '' : '/_/backend';
const AUTH_API_PATH = `${API_PREFIX}/api/auth`;

export interface AdminSession {
  readonly authenticated: true;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
  };
}

export async function fetchAdminSession(): Promise<AdminSession | null> {
  const response = await axios.get<{
    authenticated: boolean;
    user?: AdminSession['user'];
  }>(`${AUTH_API_PATH}/session`, { withCredentials: true });
  if (!response.data.authenticated || !response.data.user) return null;
  return { authenticated: true, user: response.data.user };
}

export function getGoogleLoginUrl(): string {
  return `${AUTH_API_PATH}/google`;
}

export async function logoutAdmin(): Promise<void> {
  await axios.post(`${AUTH_API_PATH}/logout`, {}, { withCredentials: true });
}

