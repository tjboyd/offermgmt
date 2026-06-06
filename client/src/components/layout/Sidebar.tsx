import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { RoleBadge } from '@/components/ui/Badge';
import { initials } from '@/lib/utils';
import { useBranding } from '@/context/BrandingContext';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/players',   label: 'Players',   icon: Users },
];

interface PipelineCounts {
  sent:       number;
  accepted:   number;
  waitlisted: number;
  draft:      number;
}

interface SidebarProps {
  counts?: PipelineCounts;
}

export function Sidebar({ counts }: SidebarProps) {
  const { user } = useAuth();
  const { branding } = useBranding();
  const isAdmin  = user?.role === 'admin' || user?.role === 'board';

  return (
    <aside className="flex flex-col h-full bg-[#111] border-r border-white/[0.08] overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-[18px] border-b border-white/[0.08]">
        {branding?.logoUrl
          ? <img src={branding.logoUrl} alt={branding.orgName ?? 'Logo'} className="w-8 h-8 rounded object-cover" />
          : <div className="w-8 h-8 rounded bg-brand flex items-center justify-center text-white font-bold text-sm">
              {(branding?.orgName ?? 'J')[0].toUpperCase()}
            </div>
        }
        <div>
          <div className="font-display font-extrabold italic text-[15px] uppercase tracking-[0.02em] leading-tight">
            {branding?.orgName ?? 'Jr Chargers'}
          </div>
          <div className="text-[10px] text-[#666] tracking-[0.16em] uppercase font-semibold mt-0.5">
            Offer Mgmt
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="p-3 flex flex-col gap-0.5 flex-1 overflow-hidden">
        <div className="text-[9px] font-bold tracking-[0.2em] text-[#555] uppercase px-3 py-2 pt-3">
          Workspace
        </div>

        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-sm font-medium text-sm transition-all duration-150',
              'border-l-[3px]',
              isActive
                ? 'bg-brand/[0.14] text-white border-brand'
                : 'text-[#AAA] border-transparent hover:bg-white/[0.04] hover:text-white',
            )}
          >
            <Icon size={16} />
            <span className="flex-1">{label}</span>
          </NavLink>
        ))}

        {isAdmin && (
          <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-sm font-medium text-sm transition-all duration-150 border-l-[3px]',
              isActive
                ? 'bg-brand/[0.14] text-white border-brand'
                : 'text-[#AAA] border-transparent hover:bg-white/[0.04] hover:text-white',
            )}
          >
            <Settings size={16} />
            <span className="flex-1">Settings</span>
          </NavLink>
        )}

        {/* Pipeline shortcuts */}
        {counts && (
          <>
            <div className="text-[9px] font-bold tracking-[0.2em] text-[#555] uppercase px-3 pt-5 pb-1.5">
              {isAdmin ? 'Pipeline' : 'My Pipeline'}
            </div>
            <PipelineLink label="Awaiting Response" count={counts.sent}       color="#E5A567" to="/players?status=sent" />
            <PipelineLink label="Accepted"          count={counts.accepted}   color="#66C97A" to="/players?status=accepted" />
            <PipelineLink label="Waitlisted"        count={counts.waitlisted} color="#6BAEFF" to="/players?status=waitlisted" />
            <PipelineLink label="Drafts"            count={counts.draft}      color="#888"    to="/players?status=draft" />
          </>
        )}
      </nav>

      {/* User card */}
      {user && <UserCard user={user} />}
    </aside>
  );
}

function PipelineLink({ label, count, color, to }: { label: string; count: number; color: string; to: string }) {
  return (
    <NavLink
      to={to}
      className="flex items-center gap-2.5 py-1.5 pl-6 pr-3 text-[12px] text-[#888] hover:text-white transition-colors"
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="flex-1">{label}</span>
      <span className="font-bold text-white text-[13px]">{count}</span>
    </NavLink>
  );
}

function UserCard({ user }: { user: { fullName: string; role: string; email: string } }) {
  const navigate = useNavigate();
  return (
    <div className="border-t border-white/[0.08]">
      <button
        onClick={() => navigate('/account')}
        className="flex items-center gap-2.5 px-3.5 py-3.5 w-full text-left hover:bg-white/[0.03] transition-colors"
        title="View your account"
      >
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          'font-display font-extrabold italic text-[13px] text-white',
          user.role === 'admin' || user.role === 'board' ? 'bg-brand' : 'bg-[#444]',
        )}>
          {initials(user.fullName.split(' ')[0] ?? '', user.fullName.split(' ')[1] ?? '')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[13px] font-semibold text-white truncate">{user.fullName}</span>
            <RoleBadge role={user.role} />
          </div>
          <div className="text-[11px] text-[#555] truncate">{user.email}</div>
        </div>
      </button>
    </div>
  );
}
