import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Ban } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'organization', label: 'Organization',    path: 'organization', roles: ['admin'],          devOnly: false },
  { id: 'seasons',      label: 'Seasons',         path: 'seasons',      roles: ['admin', 'board'], devOnly: false },
  { id: 'divisions',    label: 'Divisions',       path: 'divisions',    roles: ['admin', 'board'], devOnly: false },
  { id: 'teams',        label: 'Teams',           path: 'teams',        roles: ['admin', 'board'], devOnly: false },
  { id: 'players',      label: 'Players',         path: 'players',      roles: ['admin'],          devOnly: false },
  { id: 'templates',    label: 'Email Templates', path: 'templates',    roles: ['admin', 'board'], devOnly: false },
  { id: 'integrations', label: 'Integrations',    path: 'integrations', roles: ['admin', 'board'], devOnly: false },
  { id: 'security',     label: 'Security',        path: 'security',     roles: ['admin'],          devOnly: false },
  { id: 'users',        label: 'Users',           path: 'users',        roles: ['admin'],          devOnly: false },
  { id: 'reset',        label: 'Reset Data',      path: 'reset',        roles: ['admin'],          devOnly: true  },
];

export function SettingsPage() {
  const { user } = useAuth();
  const location  = useLocation();

  const canAccess = user?.role === 'admin' || user?.role === 'board';

  if (!canAccess) {
    return (
      <div className="scroll h-full px-8 py-8">
        <div className="overline text-brand text-[10px] font-bold tracking-[0.2em] uppercase mb-1">Configuration</div>
        <h1 className="font-display font-extrabold italic text-[42px] uppercase leading-none mb-6">Settings</h1>
        <div className="bg-bg-secondary border border-brand/25 rounded-md p-8 max-w-lg text-center">
          <div className="w-14 h-14 rounded-full bg-brand/12 text-brand flex items-center justify-center mx-auto mb-4">
            <Ban size={24} />
          </div>
          <div className="font-display font-extrabold italic text-[22px] uppercase tracking-[0.02em] mb-2">
            Admins Only
          </div>
          <p className="text-[13px] text-[#888] leading-relaxed">
            Settings — season config, integrations, email templates, and user management — are
            reserved for board admins. You're signed in as {user?.fullName}.
          </p>
          <p className="text-[12px] text-[#555] mt-3">Need a change? Contact a board admin.</p>
        </div>
      </div>
    );
  }

  const isDev = import.meta.env.DEV || import.meta.env.VITE_SHOW_RESET === 'true';
  const visibleTabs = TABS.filter((t) =>
    t.roles.includes(user!.role) && (!t.devOnly || isDev),
  );

  // Default to first tab
  if (location.pathname === '/settings' || location.pathname === '/settings/') {
    return <Navigate to={`/settings/${visibleTabs[0]?.path ?? 'seasons'}`} replace />;
  }

  return (
    <div className="scroll h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-0">
        <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-brand mb-1">Configuration</div>
        <h1 className="font-display font-extrabold italic text-[42px] uppercase leading-none mb-5">Settings</h1>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-white/[0.08]">
          {visibleTabs.map((tab) => (
            <NavLink
              key={tab.id}
              to={`/settings/${tab.path}`}
              className={({ isActive }) => cn(
                'px-4 py-3 font-display font-bold italic text-[14px] uppercase tracking-[0.06em]',
                'border-b-2 transition-all duration-150 -mb-px',
                isActive
                  ? 'text-white border-brand'
                  : 'text-[#666] border-transparent hover:text-[#AAA]',
              )}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        <Outlet />
      </div>
    </div>
  );
}

// Re-export named tabs for App.tsx routing
export { OrganizationTab } from './OrganizationTab';
export { SeasonsTab }      from './SeasonsTab';
export { DivisionsTab }    from './DivisionsTab';
export { TeamsTab }        from './TeamsTab';
export { PlayersTab }      from './PlayersTab';
export { TemplatesTab }    from './TemplatesTab';
export { SecurityTab }     from './SecurityTab';
export { UsersTab }        from './UsersTab';
export { ResetDataTab }    from './ResetDataTab';
