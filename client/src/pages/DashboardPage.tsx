import { useState, useEffect } from 'react';
import { Plus, Send, ChevronRight, Wand2 } from 'lucide-react';
import { dashboardApi, playersApi, seasonsApi, type StatusCounts, type ActivityItem, type PlayerRow, type SeasonRow } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PlayerDetailModal } from '@/components/modals/PlayerDetailModal';
import { AddPlayerModal } from '@/components/modals/AddPlayerModal';
import { ComposerModal, type ComposerMode } from '@/components/modals/ComposerModal';
import { fmtRelative, initials, cn } from '@/lib/utils';


const STATUS_COLORS: Partial<Record<string, string>> = {
  sent:       '#E5A567',
  accepted:   '#66C97A',
  declined:   '#E07070',
  expired:    '#666',
  waitlisted: '#6BAEFF',
  draft:      '#555',
  rejected:   '#444',
};

export function DashboardPage() {
  useAuth();
  const [counts, setCounts]               = useState<StatusCounts | null>(null);
  const [season, setSeason]               = useState<{ id: string; label: string } | null>(null);
  const [activity, setActivity]           = useState<ActivityItem[]>([]);
  const [recentPlayers, setRecentPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showNewSeasonPrompt, setShowNewSeasonPrompt] = useState(false);
  const [addOpen, setAddOpen]   = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ open: boolean; mode: ComposerMode; ids: string[] }>({ open: false, mode: 'offer', ids: [] });

  async function load() {
    try {
      const [stats, act, pr, sr] = await Promise.all([
        dashboardApi.stats(),
        dashboardApi.activity(),
        playersApi.list({ perPage: '5' } as Record<string,string>),
        seasonsApi.list(),
      ]);
      setCounts(stats.counts);
      setSeason(stats.season);
      setActivity(act.activity.slice(0, 20));
      setRecentPlayers(pr.players.slice(0, 5));

      // Show new-season prompt if tryout end date has passed and no future season exists
      const active: SeasonRow | undefined = sr.seasons.find((s) => s.isActive);
      if (active?.tryoutEnd) {
        const tryoutEndPassed = new Date(active.tryoutEnd) < new Date();
        const hasNextSeason   = sr.seasons.some((s) => !s.isArchived && !s.isActive);
        setShowNewSeasonPrompt(tryoutEndPassed && !hasNextSeason);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const tiles = counts ? [
    { label: 'Offers Out',   value: counts.sent,      sub: 'Awaiting response',       accent: true },
    { label: 'Accepted',     value: counts.accepted,  sub: 'Registered on SE' },
    { label: 'Declined/Exp', value: counts.declined + counts.expired, sub: `${counts.declined} declined · ${counts.expired} expired` },
    { label: 'In Pipeline',  value: counts.draft + counts.waitlisted, sub: `${counts.draft} draft · ${counts.waitlisted} waitlist` },
  ] : [];

  if (loading) {
    return <div className="flex items-center justify-center h-full text-[#555]">Loading dashboard…</div>;
  }

  return (
    <div className="p-8 flex flex-col gap-7">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-brand mb-1">
            {season?.label ?? '—'} Season
          </div>
          <h1 className="font-display font-extrabold italic text-[42px] uppercase leading-none tracking-[-0.01em]">
            Offer Pipeline
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="md" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add Player
          </Button>
          <Button variant="primary" size="md" onClick={() => setComposer({ open: true, mode: 'offer', ids: [] })}>
            <Send size={14} /> Send Offer
          </Button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {tiles.map((t, i) => (
          <div key={i} className={cn(
            'bg-bg-secondary border rounded-md px-5 py-4',
            t.accent ? 'border-[#E5A567]/30 bg-[#E5A567]/[0.04]' : 'border-white/[0.08]',
          )}>
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#666] mb-2">{t.label}</div>
            <div className={cn(
              'font-display font-extrabold italic leading-none mb-1',
              t.accent ? 'text-[#E5A567] text-[52px]' : 'text-white text-[48px]',
            )}>
              {t.value}
            </div>
            <div className="text-[11px] text-[#555]">{t.sub}</div>
          </div>
        ))}
      </div>

      {/* New season prompt */}
      {showNewSeasonPrompt && (
        <div className="flex items-center gap-4 px-5 py-4 border border-brand/30 bg-brand/[0.05] rounded-md">
          <Wand2 size={18} className="text-brand shrink-0" />
          <div className="flex-1">
            <div className="text-[14px] font-bold text-white">Ready to set up the next season?</div>
            <div className="text-[12px] text-[#888] mt-0.5">Tryouts for the current season have wrapped. Configure the next season to start taking new registrations.</div>
          </div>
          <a
            href="/settings/seasons"
            className="font-display font-extrabold italic uppercase text-[13px] tracking-[0.06em] text-brand border border-brand/40 px-4 py-2 rounded-sm hover:bg-brand/10 transition-colors whitespace-nowrap"
          >
            New Season Wizard
          </a>
        </div>
      )}

      {/* Two-column: activity + breakdown + recent */}
      <div className="grid gap-5" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        {/* Activity feed */}
        <div className="bg-bg-secondary border border-white/[0.08] rounded-md p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-extrabold italic text-[18px] uppercase tracking-[0.04em]">Activity Feed</h3>
            <span className="text-[11px] text-[#555] tracking-[0.08em] uppercase">Last 30 days</span>
          </div>
          <div className="pr-1">
            {activity.length === 0 ? (
              <p className="text-[#555] text-[13px]">No activity yet. Send an offer to get started.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {activity.map((a) => {
                  const isHot = ['offer_accepted','offer_sent','landing_page_viewed'].includes(a.eventType);
                  return (
                    <div key={a.id} className="flex items-start gap-2.5 py-1.5">
                      <div className={cn(
                        'w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5',
                        isHot ? 'bg-brand/20 text-brand' : 'bg-white/[0.04] text-[#555]',
                      )}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', isHot ? 'bg-brand' : 'bg-[#444]')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-[#CCC] leading-snug">{a.actorLabel} — {formatEvent(a.eventType)}</div>
                        <div className="text-[11px] text-[#555] mt-0.5">{fmtRelative(a.ts)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: scrollable so breakdown + recent both show regardless of viewport */}
        <div className="flex flex-col gap-4">
          {/* Status breakdown */}
          {counts && (
            <div className="bg-bg-secondary border border-white/[0.08] rounded-md p-5 shrink-0">
              <h3 className="font-display font-extrabold italic text-[18px] uppercase tracking-[0.04em] mb-4">Status Breakdown</h3>
              <div className="flex flex-col gap-2.5">
                {(['sent','accepted','declined','expired','waitlisted','rejected','draft'] as const).map((s) => {
                  const c = counts[s] ?? 0;
                  const pct = counts.total ? (c / counts.total) * 100 : 0;
                  return (
                    <div key={s} className="flex items-center gap-2.5">
                      <div className="w-24 flex-shrink-0"><StatusBadge status={s} /></div>
                      <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, background: STATUS_COLORS[s] ?? '#555' }}
                        />
                      </div>
                      <div className="font-display font-extrabold italic text-[18px] w-7 text-right">{c}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent players */}
          <div className="bg-bg-secondary border border-white/[0.08] rounded-md p-5 shrink-0">
            <h3 className="font-display font-extrabold italic text-[18px] uppercase tracking-[0.04em] mb-3">Recent Players</h3>
            {recentPlayers.length === 0 ? (
              <p className="text-[#555] text-[13px]">No players yet. Add players or sync from SportsEngine.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {recentPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setDetailId(p.id)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-sm border border-white/[0.06] hover:bg-white/[0.03] transition-colors w-full text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#242424] flex items-center justify-center font-display font-extrabold italic text-[12px] text-white flex-shrink-0">
                      {initials(p.firstName, p.lastName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[13px]">{p.firstName} {p.lastName}</div>
                      <div className="text-[11px] text-[#555]">{fmtRelative(p.updatedAt)}</div>
                    </div>
                    <StatusBadge status={p.status} />
                    <ChevronRight size={13} className="text-[#444]" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AddPlayerModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} />
      <ComposerModal
        open={composer.open}
        mode={composer.mode}
        initialIds={composer.ids}
        onClose={() => setComposer((c) => ({ ...c, open: false }))}
        onSent={load}
      />
      <PlayerDetailModal
        open={!!detailId} playerId={detailId}
        onClose={() => setDetailId(null)}
        onRefresh={load}
        onOpenComposer={(mode, ids) => setComposer({ open: true, mode, ids })}
      />
    </div>
  );
}

function formatEvent(type: string): string {
  const map: Record<string, string> = {
    player_added:             'player added',
    offer_sent:               'offer sent',
    offer_resent:             'offer resent',
    rejection_sent:           'rejection sent',
    email_opened:             'email opened',
    landing_page_viewed:      'acceptance page viewed',
    offer_accepted:           'offer accepted',
    offer_declined:           'offer declined',
    offer_expired:            'offer expired',
    se_redirected:            'redirected to SE registration',
    returning_flag_set:       'marked as returning',
    early_offer_eligible_set: 'early offer eligible set',
    status_changed:           'status changed',
    note_added:               'note added',
  };
  return map[type] ?? type;
}
