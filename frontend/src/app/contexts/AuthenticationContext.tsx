/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchAdminSession, logoutAdmin, type AdminSession } from '../../features/contracts/services/adminAuthApi';

interface AuthenticationContextValue {
  readonly status: 'loading' | 'authenticated' | 'anonymous' | 'unavailable';
  readonly session: AdminSession | null;
  readonly refresh: () => Promise<void>;
  readonly logout: () => Promise<void>;
}

const AuthenticationContext = createContext<AuthenticationContextValue | null>(null);
const SESSION_CHANNEL = 'form_site_session_events';

export function AuthenticationProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthenticationContextValue['status']>('loading');
  const [session, setSession] = useState<AdminSession | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchAdminSession();
      setSession(next); setStatus(next ? 'authenticated' : 'anonymous');
    } catch { setSession(null); setStatus('unavailable'); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    const listener = () => { void refresh(); };
    window.addEventListener('form-site-auth-refresh', listener);
    return () => window.removeEventListener('form-site-auth-refresh', listener);
  }, [refresh]);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.onmessage = (event) => {
      if (event.data === 'logout' || event.data === 'refresh') {
        queryClient.cancelQueries(); queryClient.clear(); void refresh();
      }
    };
    return () => channel.close();
  }, [queryClient, refresh]);

  const logout = useCallback(async () => {
    await queryClient.cancelQueries();
    try { await logoutAdmin(); } finally {
      queryClient.clear(); setSession(null); setStatus('anonymous');
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(SESSION_CHANNEL); channel.postMessage('logout'); channel.close();
      }
    }
  }, [queryClient]);

  const value = useMemo(() => ({ status, session, refresh, logout }), [status, session, refresh, logout]);
  return <AuthenticationContext.Provider value={value}>{children}</AuthenticationContext.Provider>;
}

export function useAuthentication(): AuthenticationContextValue {
  const value = useContext(AuthenticationContext);
  if (!value) throw new Error('AuthenticationProvider is required.');
  return value;
}
