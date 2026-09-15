import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useOrganization } from '../../../app/contexts/OrganizationContext';
import { tenantQueryKey } from '../../../app/contexts/tenantState';
import { requestBase } from '../services/arrangementRequestsApi';

/** A stream carries only scope revisions; order data always comes from authorized HTTP reads. */
export function useArrangementChanges() {
  const { organization, membership, epoch } = useOrganization();
  const client = useQueryClient(); const navigate = useNavigate();
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  useEffect(() => {
    if (typeof EventSource === 'undefined' || (membership.role === 'inquilino' && !membership.arrangement_property_id)) return;
    let active = true; let stream: EventSource | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
    let retry = 500; let generation = 0; let revision: string | undefined; let needsRefresh = true;
    const queryKey = tenantQueryKey(organization.id, epoch, 'arrangements');
    const filters = { queryKey, predicate: (query: { queryKey: readonly unknown[] }) => ['orders', 'tenant-orders', 'personal-orders'].includes(String(query.queryKey[4])) };
    const clearOrders = async () => {
      // Do not queue invalidations behind a refetch: it may be slow or already revoked.
      const current = ++generation;
      await client.cancelQueries(filters);
      if (active && current === generation) void client.resetQueries(filters);
    };
    const reconnect = (immediate = false) => {
      stream?.close(); clearTimeout(timer);
      if (!active) return;
      if (!immediate) { needsRefresh = true; setConnection('reconnecting'); void clearOrders(); }
      timer = setTimeout(connect, immediate ? 0 : retry);
      if (!immediate) retry = Math.min(retry * 2, 15_000);
    };
    function connect() {
      if (!active) return;
      stream = new EventSource(`${requestBase(organization.id)}/changes`, { withCredentials: true });
      const receive = (event: MessageEvent) => {
        if (!active) return;
        try {
          const next: unknown = JSON.parse(event.data);
          if (!next || typeof next !== 'object' || !('revision' in next) || typeof next.revision !== 'string' || !/^\d+$/u.test(next.revision)) throw new Error('INVALID_SIGNAL');
          retry = 500; setConnection('connected');
          if (needsRefresh || revision !== next.revision) void clearOrders();
          revision = next.revision; needsRefresh = false;
        } catch { reconnect(); }
      };
      stream.addEventListener('ready', receive);
      stream.addEventListener('invalidate', receive);
      stream.addEventListener('renew', () => reconnect(true));
      stream.addEventListener('unavailable', () => reconnect());
      stream.addEventListener('revoked', () => {
        stream?.close();
        void client.cancelQueries({ queryKey }).then(() => {
          if (!active) return;
          client.removeQueries({ queryKey }); navigate('/', { replace: true });
        });
      });
      stream.onerror = () => reconnect();
    }
    const onFocus = () => { if (document.visibilityState !== 'hidden') { void clearOrders(); reconnect(true); } };
    connect(); window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus);
    return () => { active = false; stream?.close(); clearTimeout(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [client, epoch, membership.id, membership.role, membership.arrangement_property_id, navigate, organization.id]);
  return connection;
}
