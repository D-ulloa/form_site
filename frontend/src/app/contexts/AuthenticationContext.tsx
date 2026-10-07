/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AdminAuthError, checkAdminSession, fetchAdminSession, logoutAdmin,
  recoverSelfServiceRegistration, SELF_SERVICE_OPERATION_STORAGE_KEY,
  type AdminSession,
} from '../../features/contracts/services/adminAuthApi';
import { isSessionProtectedPage, sessionLoginPath } from '../auth/sessionNavigation.ts';
import { notifyApplicationSessionFailure, SESSION_AUTHENTICATION_FAILURE_EVENT } from '../auth/sessionRequests.ts';

interface AuthenticationContextValue {
  readonly status: 'loading' | 'authenticated' | 'anonymous' | 'unavailable';
  readonly session: AdminSession | null;
  readonly sessionExpired: boolean;
  readonly refresh: () => Promise<void>;
  readonly logout: () => Promise<void>;
}

const AuthenticationContext = createContext<AuthenticationContextValue | null>(null);
const SESSION_CHANNEL = 'form_site_session_events';
const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function broadcastSessionEvent(event: 'logout' | 'expired'): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage(event);
    channel.close();
  } catch { /* Other tabs can independently check their session. */ }
}

export function AuthenticationProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<AuthenticationContextValue['status']>('loading');
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const activeSession = useRef<AdminSession | null>(null);
  const epoch = useRef(0);
  const pendingCheck = useRef<Promise<void> | null>(null);

  const applySession = useCallback((next: AdminSession | null, expired = activeSession.current !== null) => {
    if (activeSession.current && activeSession.current.user.id !== next?.user.id) {
      void queryClient.cancelQueries();
      queryClient.clear();
    }
    activeSession.current = next;
    setSession(next);
    setStatus(next ? 'authenticated' : 'anonymous');
    setSessionExpired(!next && expired);
  }, [queryClient]);

  const refresh = useCallback(async () => {
    const requestEpoch = ++epoch.current;
    try {
      let next = await fetchAdminSession();
      const operationId = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(SELF_SERVICE_OPERATION_STORAGE_KEY);
      if (next && (next.memberships ?? []).length === 0 && operationId) {
        try {
          next = await recoverSelfServiceRegistration(operationId);
          sessionStorage.removeItem(SELF_SERVICE_OPERATION_STORAGE_KEY);
        } catch {
          // A stale or rejected intent must never block an otherwise valid login.
        }
      }
      if (requestEpoch === epoch.current) applySession(next);
    } catch (error) {
      if (requestEpoch !== epoch.current) return;
      if (error instanceof AdminAuthError && error.status === 401) applySession(null);
      else if (!activeSession.current) setStatus('unavailable');
    }
  }, [applySession]);

  const checkSession = useCallback((): Promise<void> => {
    if (!activeSession.current) return Promise.resolve();
    if (pendingCheck.current) return pendingCheck.current;
    const requestEpoch = epoch.current;
    const expire = () => {
      if (requestEpoch !== epoch.current) return;
      epoch.current += 1;
      applySession(null);
      broadcastSessionEvent('expired');
    };
    const check = (async () => {
      try {
        const next = await checkAdminSession();
        if (requestEpoch !== epoch.current) return;
        if (next) applySession(next);
        else expire();
      } catch (error) {
        // An outage cannot establish that a previously valid session expired.
        if (error instanceof AdminAuthError && error.status === 401) expire();
      }
    })();
    pendingCheck.current = check;
    void check.finally(() => {
      if (pendingCheck.current === check) pendingCheck.current = null;
    });
    return check;
  }, [applySession]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => () => { epoch.current += 1; }, []);
  useEffect(() => {
    if (status !== 'authenticated' || !isSessionProtectedPage(location.pathname)) return;
    const checkVisibleSession = () => {
      if (document.visibilityState === 'visible') void checkSession();
    };
    checkVisibleSession();
    const timer = window.setInterval(checkVisibleSession, SESSION_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', checkVisibleSession);
    window.addEventListener('focus', checkVisibleSession);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkVisibleSession);
      window.removeEventListener('focus', checkVisibleSession);
    };
  }, [status, location.pathname, checkSession]);
  useEffect(() => {
    const listener = () => {
      const alreadyChecking = pendingCheck.current !== null;
      void checkSession().then(() => {
        // A check started before the failed request may have seen an older,
        // valid session. Confirm again once that check has finished.
        if (alreadyChecking && activeSession.current) void checkSession();
      });
    };
    window.addEventListener(SESSION_AUTHENTICATION_FAILURE_EVENT, listener);
    const interceptor = axios.interceptors.response.use(undefined, (error: unknown) => {
      notifyApplicationSessionFailure(error);
      return Promise.reject(error);
    });
    return () => {
      window.removeEventListener(SESSION_AUTHENTICATION_FAILURE_EVENT, listener);
      axios.interceptors.response.eject(interceptor);
    };
  }, [checkSession]);
  useEffect(() => {
    if (status === 'anonymous' && sessionExpired && isSessionProtectedPage(location.pathname)) {
      void navigate(sessionLoginPath(location.pathname, true), { replace: true });
    }
  }, [location.pathname, navigate, sessionExpired, status]);
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
      } else if (event.data === 'expired' && isSessionProtectedPage(location.pathname)) void checkSession();
    };
    return () => channel.close();
  }, [queryClient, refresh, checkSession, location.pathname]);

  const logout = useCallback(async () => {
    epoch.current += 1;
    activeSession.current = null;
    await queryClient.cancelQueries();
    try { await logoutAdmin(); } finally {
      epoch.current += 1;
      queryClient.clear(); applySession(null, false);
      broadcastSessionEvent('logout');
    }
  }, [queryClient, applySession]);

  const value = useMemo(() => ({ status, session, sessionExpired, refresh, logout }),
    [status, session, sessionExpired, refresh, logout]);
  return <AuthenticationContext.Provider value={value}>{children}</AuthenticationContext.Provider>;
}

export function useAuthentication(): AuthenticationContextValue {
  const value = useContext(AuthenticationContext);
  if (!value) throw new Error('AuthenticationProvider is required.');
  return value;
}
