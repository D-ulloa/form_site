/* eslint-disable react-refresh/only-export-components */
import { Activity, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { useAuthentication } from './AuthenticationContext';
import type { AdminSession } from '../../features/contracts/services/adminAuthApi';
import type { OrganizationRole, MembershipStatus } from '../../features/organizations/types';

const API_PREFIX = import.meta.env.DEV ? '' : '/_/backend';

export interface ConfirmedOrganizationContext {
  readonly organization: { readonly id: string; readonly slug: string; readonly display_name: string;
    readonly status: 'active' | 'suspended' | 'pending_deletion' | 'deleted' };
  readonly membership: { readonly id: string; readonly organization_id: string;
    readonly user_id: string; readonly role: OrganizationRole;
    readonly status: MembershipStatus; readonly version: number };
  readonly capabilities: readonly string[];
  readonly home_destination: 'organization' | 'inquilino' | null;
  readonly epoch: number;
}

const OrganizationContext = createContext<ConfirmedOrganizationContext | null>(null);

interface ContextRequest {
  readonly organizationSlug: string;
  readonly navigation: string;
  readonly pathname: string;
  readonly session: AdminSession | null;
}
function samePage(a: ContextRequest, b: ContextRequest): boolean {
  return a.session === b.session && a.organizationSlug === b.organizationSlug
    && a.navigation === b.navigation && a.pathname === b.pathname;
}
function authority(context: Omit<ConfirmedOrganizationContext, 'epoch'>): string {
  return JSON.stringify([context.organization, context.membership,
    [...context.capabilities].sort(), context.home_destination]);
}


export function OrganizationRouteBoundary() {
  const { organizationSlug = '' } = useParams();
  const location = useLocation();
  const authentication = useAuthentication();
  const queryClient = useQueryClient();
  const epoch = useRef(0);
  const confirmed = useRef<{ request: ContextRequest; context: ConfirmedOrganizationContext } | null>(null);
  const [revision, setRevision] = useState(0);
  // A fresh identity for every transition also distinguishes A → B → A while B is loading.
  const request = useMemo(() => ({ organizationSlug, navigation: location.key,
    pathname: location.pathname, session: authentication.session, status: authentication.status, revision }),
  [organizationSlug, location.key, location.pathname, authentication.session, authentication.status, revision]);
  const [resolved, setResolved] = useState<{
    request: typeof request;
    state: 'ready' | 'denied' | 'unavailable';
    context: ConfirmedOrganizationContext | null;
  } | null>(null);

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const revalidate = () => {
      if (document.visibilityState === 'hidden' || debounce !== undefined) return;
      setRevision(value => value + 1);
      // Returning to a tab commonly dispatches both visibilitychange and focus.
      debounce = setTimeout(() => { debounce = undefined; }, 100);
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
      clearTimeout(debounce);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestEpoch = ++epoch.current;
    const current = () => !controller.signal.aborted && requestEpoch === epoch.current;
    if (request.status !== 'authenticated' || !request.session) return () => controller.abort();
    void (async () => {
      try {
        await queryClient.cancelQueries();
        if (!current()) return;
        const previous = confirmed.current;
        const retainingPage = previous !== null && samePage(previous.request, request);
        if (!retainingPage) queryClient.clear();
        const response = await axios.get<Omit<ConfirmedOrganizationContext, 'epoch'>>(
          `${API_PREFIX}/api/organizations/${encodeURIComponent(request.organizationSlug)}/context`,
          { withCredentials: true, signal: controller.signal },
        );
        if (!current()) return;
        const context = response.data;
        if (context.membership.organization_id !== context.organization.id
          || context.membership.user_id !== request.session?.user.id
          || context.membership.status !== 'active') {
          confirmed.current = null;
          queryClient.clear();
          setResolved({ request, state: 'denied', context: null });
          return;
        }
        const unchanged = retainingPage && authority(previous.context) === authority(context);
        if (!unchanged) queryClient.clear();
        const next = { ...context, epoch: unchanged ? previous.context.epoch : requestEpoch };
        confirmed.current = { request, context: next };
        setResolved({ request, state: 'ready', context: next });
      } catch (error) {
        if (!current()) return;
        confirmed.current = null;
        queryClient.clear();
        setResolved({ request, context: null,
          state: axios.isAxiosError(error) && [401, 403, 404].includes(error.response?.status ?? 0)
            ? 'denied' : 'unavailable' });
      }
    })();
    return () => { controller.abort(); epoch.current += 1; };
  }, [request, queryClient]);

  if (authentication.status === 'anonymous') return <Navigate to="/login" replace />;
  if (authentication.status === 'unavailable') return <NeutralShell label="El contexto seguro no está disponible." />;
  const pending = resolved?.request !== request;
  const retainingPage = resolved?.state === 'ready' && samePage(resolved.request, request);
  if (authentication.status === 'loading' || !resolved || (pending && !retainingPage)) {
    return <NeutralShell label="Validando organización…" />;
  }
  if (resolved.state === 'unavailable') return <NeutralShell label="El contexto seguro no está disponible." />;
  if (resolved.state === 'denied' || !resolved.context) return <Navigate to="/" replace />;
  return <>
    {pending ? <NeutralShell label="Validando organización…" /> : null}
    <Activity mode={pending ? 'hidden' : 'visible'}>
      <OrganizationContext.Provider value={resolved.context}>
        <Outlet key={resolved.context.epoch} />
      </OrganizationContext.Provider>
    </Activity>
  </>;
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
