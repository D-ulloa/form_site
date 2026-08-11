import type { QueryClient } from '@tanstack/react-query';

/** Remove account-bound contract data whenever the authenticated account changes. */
export function clearContractAdminQueryCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: ['contract-admin-session'] });
  queryClient.removeQueries({ queryKey: ['contract-admin-entries'] });
  queryClient.removeQueries({ queryKey: ['contract-admin-entry'] });
}
