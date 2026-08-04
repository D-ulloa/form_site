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

export interface PasswordAuthInput {
  readonly email: string;
  readonly password: string;
  readonly rememberMe?: boolean;
}

export interface RegistrationInput extends PasswordAuthInput {
  readonly name: string;
  readonly company?: string;
  readonly role?: string;
}

export class AdminAuthError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AdminAuthError';
    this.status = status;
  }
}

function authError(error: unknown, fallback: string): AdminAuthError {
  if (axios.isAxiosError(error)) {
    const message = typeof error.response?.data?.message === 'string'
      ? error.response.data.message
      : fallback;
    return new AdminAuthError(message, error.response?.status);
  }
  return error instanceof AdminAuthError
    ? error
    : new AdminAuthError(fallback);
}

export async function fetchAdminSession(): Promise<AdminSession | null> {
  try {
    const response = await axios.get<{
      authenticated: boolean;
      user?: AdminSession['user'];
    }>(`${AUTH_API_PATH}/session`, { withCredentials: true });
    if (!response.data.authenticated || !response.data.user) return null;
    return { authenticated: true, user: response.data.user };
  } catch (error) {
    throw authError(error, 'No se pudo comprobar la sesión.');
  }
}

export async function loginAdmin(input: PasswordAuthInput): Promise<AdminSession> {
  try {
    const response = await axios.post<AdminSession>(
      `${AUTH_API_PATH}/login`,
      input,
      { withCredentials: true },
    );
    return response.data;
  } catch (error) {
    throw authError(error, 'No se pudo iniciar sesión.');
  }
}

export async function registerAdmin(input: RegistrationInput): Promise<AdminSession> {
  try {
    const response = await axios.post<AdminSession>(
      `${AUTH_API_PATH}/register`,
      input,
      { withCredentials: true },
    );
    return response.data;
  } catch (error) {
    throw authError(error, 'No se pudo crear la cuenta.');
  }
}

export async function logoutAdmin(): Promise<void> {
  try {
    await axios.post(`${AUTH_API_PATH}/logout`, {}, { withCredentials: true });
  } catch (error) {
    throw authError(error, 'No se pudo cerrar la sesión.');
  }
}
