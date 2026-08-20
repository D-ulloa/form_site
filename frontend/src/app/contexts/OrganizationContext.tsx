/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAuthentication } from './AuthenticationContext';

const API_PREFIX = import.meta.env.DEV ? '' : '/_/backend';

export interface ConfirmedOrganizationContext {
  readonly organization: { readonly id: string; readonly slug: string; readonly display_name: string;
    readonly status: 'active' | 'suspended' | 'pending_deletion' | 'deleted' };
  readonly membership: { readonly id: string; readonly organization_id: string;
    readonly user_id: string; readonly role: 'owner' | 'admin' | 'member' | 'viewer';
    readonly status: 'active' | 'suspended' | 'removed'; readonly version: number };
  readonly capabilities: readonly string[];
  readonly epoch: number;
}

const OrganizationContext = createContext<ConfirmedOrganizationContext | null>(null);

export function OrganizationRouteBoundary() {
  const { organizationSlug = '' } = useParams();
  const authentication = useAuthentication();
  const queryClient = useQueryClient();
  const epoch = useRef(0);
  const [context, setContext] = useState<ConfirmedOrganizationContext | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'unavailable'>('loading');
  const [resolvedSlug, setResolvedSlug] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const requestEpoch = ++epoch.current;
    void queryClient.cancelQueries().then(async () => {
      if (authentication.status !== 'authenticated') return;
      try {
        const response = await axios.get<Omit<ConfirmedOrganizationContext, 'epoch'>>(
          `${API_PREFIX}/api/organizations/${encodeURIComponent(organizationSlug)}/context`,
          { withCredentials: true, signal: controller.signal },
        );
        if (controller.signal.aborted || requestEpoch !== epoch.current) return;
        setContext({ ...response.data, epoch: requestEpoch }); setResolvedSlug(organizationSlug); setState('ready');
      } catch (error) {
        if (controller.signal.aborted || requestEpoch !== epoch.current) return;
        setResolvedSlug(organizationSlug); setState(axios.isAxiosError(error) && [401, 403, 404].includes(error.response?.status ?? 0)
          ? 'denied' : 'unavailable');
      }
    });
    return () => { controller.abort(); epoch.current += 1; setContext(null); };
  }, [authentication.status, organizationSlug, queryClient]);

  if (authentication.status === 'anonymous') return <Navigate to="/login" replace />;
  if (authentication.status === 'loading' || state === 'loading' || resolvedSlug !== organizationSlug) return <NeutralShell label="Validando organización…" />;
  if (authentication.status === 'unavailable' || state === 'unavailable') return <NeutralShell label="El contexto seguro no está disponible." />;
  if (state === 'denied' || !context) return <Navigate to="/" replace />;
  return <OrganizationContext.Provider value={context}><Outlet /></OrganizationContext.Provider>;
}

function NeutralShell({ label }: { readonly label: string }) {
  return <main className="flex min-h-dvh items-center justify-center bg-[var(--bg-base)] text-sm text-slate-400" role="status">{label}</main>;
}

export function useOrganization(): ConfirmedOrganizationContext {
  const value = useContext(OrganizationContext);
  if (!value) throw new Error('A confirmed organization route is required.');
  return value;
}

export function useOptionalOrganization(): ConfirmedOrganizationContext | null {
  return useContext(OrganizationContext);
}
