import { Navigate, Outlet } from 'react-router-dom';
import { useOrganization } from './contexts/OrganizationContext';

type Home = 'organization' | 'inquilino' | 'personal';
/** Screens mount only after the server's destination, role and capabilities agree. */
export function OrganizationAccessBoundary({ home }: { readonly home: Home }) {
  const context = useOrganization();
  const { membership, capabilities, home_destination } = context;
  const active = membership.status === 'active';
  const destinations: Record<Home, boolean> = {
    personal: active && context.organization.status === 'active' && membership.role === 'personal'
      && capabilities.includes('personal.home.read'),
    inquilino: active && context.organization.status === 'active' && membership.role === 'inquilino'
      && capabilities.includes('inquilino.home.read'),
    organization: active && ['owner', 'admin', 'member', 'viewer'].includes(membership.role)
      && capabilities.includes('organization.read'),
  };
  const confirmed = home_destination && destinations[home_destination] === true ? home_destination : null;
  if (confirmed === home) return <Outlet />;
  const base = `/t/${encodeURIComponent(context.organization.slug)}`;
  const destination = confirmed === 'organization' ? base : confirmed ? `${base}/${confirmed}` : '/';
  return <Navigate to={destination} replace />;
}
