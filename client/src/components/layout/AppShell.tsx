import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { dashboardApi } from '@/lib/api';

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/roster':    'Roster',
  '/settings':  'Settings',
};

type PipelineCounts = { sent: number; accepted: number; waitlisted: number; draft: number };

export function AppShell() {
  const location = useLocation();
  const pageLabel = PAGE_LABELS[location.pathname] ?? '';

  const [season,   setSeason]   = useState<string>('');
  const [counts,   setCounts]   = useState<PipelineCounts | undefined>(undefined);

  const fetchCounts = useCallback(async () => {
    try {
      const { counts: c, season: s } = await dashboardApi.stats();
      setSeason(s?.label ?? '');
      setCounts({
        sent:       c.sent,
        accepted:   c.accepted,
        waitlisted: c.waitlisted,
        draft:      c.draft,
      });
    } catch { /* ignore — sidebar counts are non-critical */ }
  }, []);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  return (
    <div className="grid h-screen overflow-hidden" style={{ gridTemplateColumns: '240px 1fr' }}>
      <Sidebar counts={counts} />

      <main className="flex flex-col bg-bg-primary overflow-hidden">
        {/* Top sub-bar */}
        <div className="flex items-center justify-between px-8 py-3 border-b border-white/[0.08] bg-black/20">
          <div className="flex items-center gap-3 text-xs text-[#888]">
            <span>{pageLabel}</span>
            {season && (
              <>
                <span className="text-[#444]">·</span>
                <span className="text-brand font-semibold tracking-[0.04em]">{season}</span>
              </>
            )}
          </div>
          {counts !== undefined && counts.sent > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-[#555]">
              <Zap size={12} className="text-brand" />
              <span>{counts.sent} offer{counts.sent !== 1 ? 's' : ''} awaiting response</span>
            </div>
          )}
        </div>

        {/* Page content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
