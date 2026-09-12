import { Navigate, Outlet } from 'react-router-dom';
import { useOrganization } from './contexts/OrganizationContext';

/** Both routes use the server's destination and effective capabilities. */
export function OrganizationAccessBoundary({ home }: { readonly home: 'organization' | 'inquilino' }) {
  const context = useOrganization();
  const isInquilino = context.membership.role === 'inquilino';
  const canEnter = context.membership.status === 'active' && context.home_destination === home
    && (home === 'inquilino'
      ? isInquilino && context.capabilities.includes('inquilino.home.read')
      : !isInquilino && context.capabilities.includes('organization.read'));
  if (canEnter) return <Outlet />;

  const base = `/t/${encodeURIComponent(context.organization.slug)}`;
  const destination = context.home_destination === 'inquilino' && isInquilino
    && context.capabilities.includes('inquilino.home.read') ? `${base}/inquilino`
    : context.home_destination === 'organization' && !isInquilino
      && context.capabilities.includes('organization.read') ? base : '/';
  return <Navigate to={destination} replace />;
}
