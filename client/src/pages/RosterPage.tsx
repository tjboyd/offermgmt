import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, ChevronRight, Loader2, SlidersHorizontal, X } from 'lucide-react';
import { playersApi, teamsApi, seasonsApi, type PlayerRow, type TeamRow, type SeasonRow } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AddPlayerModal } from '@/components/modals/AddPlayerModal';
import { PlayerDetailModal } from '@/components/modals/PlayerDetailModal';
import { ComposerModal, type ComposerMode } from '@/components/modals/ComposerModal';
import { fmtRelative, fmtBirthDate, initials, cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft',      label: 'Draft' },
  { value: 'sent',       label: 'Sent' },
  { value: 'accepted',   label: 'Accepted' },
  { value: 'declined',   label: 'Declined' },
  { value: 'expired',    label: 'Expired' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'rejected',   label: 'Not Selected' },
];

export function RosterPage() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin' || user?.role === 'board';
  const canSend  = isAdmin || user?.role === 'head_coach';

  // Sync filter state with URL query params so sidebar pipeline links work
  const [searchParams, setSearchParams] = useSearchParams();

  const [players,       setPlayers]       = useState<PlayerRow[]>([]);
  const [teams,         setTeams]         = useState<TeamRow[]>([]);
  const [allSeasons,    setAllSeasons]    = useState<SeasonRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [noActiveSeason, setNoActiveSeason] = useState(false);

  // Filters — derive directly from URL so sidebar pipeline links update the view
  const search       = searchParams.get('search')    ?? '';
  const statusFilter = searchParams.get('status')    ?? '';
  const teamFilter   = searchParams.get('teamId')    ?? '';
  const returning    = searchParams.get('returning') === 'true';

  // Advanced filters (client-side)
  const [advOpen,  setAdvOpen]  = useState(false);
  const [dobFrom,  setDobFrom]  = useState('');
  const [dobTo,    setDobTo]    = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const advActiveCount = [dobFrom, dobTo, gradeFilter].filter(Boolean).length;

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals
  const [addOpen,  setAddOpen]  = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [composer,     setComposer]     = useState<{ open: boolean; mode: ComposerMode; ids: string[] }>({ open: false, mode: 'offer', ids: [] });

  function updateFilter(key: string, value: string | boolean) {
    const next = new URLSearchParams(searchParams);
    const strVal = String(value);
    if (strVal === '' || strVal === 'false') next.delete(key);
    else next.set(key, strVal);
    setSearchParams(next, { replace: true });
  }

  function openComposer(mode: ComposerMode, ids: string[]) {
    setComposer({ open: true, mode, ids });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setNoActiveSeason(false);
    try {
      const [pr, tr, sr] = await Promise.all([
        playersApi.list({
          search:     search       || undefined,
          status:     statusFilter || undefined,
          teamId:     teamFilter   || undefined,
          returning:  returning ? 'true' : undefined,
        } as Record<string, string>),
        teamsApi.list(),
        seasonsApi.list(),
      ]);
      const activeSeason = sr.seasons.find((s) => s.isActive);
      setAllSeasons(sr.seasons);
      if (!activeSeason) setNoActiveSeason(true);
      setPlayers(pr.players);
      setTeams(tr.teams.filter((t) => t.isActive && (!activeSeason || t.seasonId === activeSeason.id)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, teamFilter, returning]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [players]);

  // Client-side advanced filtering
  const visiblePlayers = players.filter((p) => {
    if (gradeFilter && (p.grade ?? '').toLowerCase() !== gradeFilter.toLowerCase()) return false;
    if (dobFrom || dobTo) {
      if (!p.dateOfBirth) return false; // hide players with no DOB when range is active
      if (dobFrom && p.dateOfBirth < dobFrom) return false;
      if (dobTo   && p.dateOfBirth > dobTo)   return false;
    }
    return true;
  });

  // Bulk selection helpers
  const toggleOne = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelected(selected.size === visiblePlayers.length ? new Set() : new Set(visiblePlayers.map((p) => p.id)));
  const allChecked  = visiblePlayers.length > 0 && selected.size === visiblePlayers.length;
  const selectedArr = [...selected];

  const canBulkOffer     = canSend && selectedArr.length > 0 &&
    selectedArr.every((id) => ['draft','waitlisted','expired'].includes(players.find((p) => p.id === id)?.status ?? ''));
  const canBulkReject    = canSend && selectedArr.length > 0 &&
    selectedArr.every((id) => ['draft','waitlisted'].includes(players.find((p) => p.id === id)?.status ?? ''));
  const canBulkWaitlist  = canSend && selectedArr.length > 0 &&
    selectedArr.every((id) => ['draft','expired'].includes(players.find((p) => p.id === id)?.status ?? ''));

  async function bulkAssignTeam(teamId: string | null) {
    await Promise.all(
      selectedArr.map((id) =>
        playersApi.update(id, { teamId } as Parameters<typeof playersApi.update>[1])
      )
    );
    load(); setSelected(new Set());
  }

  async function bulkWaitlist() {
    await Promise.all(selectedArr.map((id) => playersApi.setStatus(id, 'waitlisted')));
    load(); setSelected(new Set());
  }

  function teamName(teamId: string | null | undefined) {
    return teams.find((t) => t.id === teamId)?.name ?? '—';
  }

  function seasonLabel(seasonId: string | null | undefined) {
    return allSeasons.find((s) => s.id === seasonId)?.label ?? null;
  }

  return (
    <div className="flex flex-col gap-4 p-8">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap flex-shrink-0">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-brand mb-1">
            {visiblePlayers.length} Player{visiblePlayers.length !== 1 ? 's' : ''}
          </div>
          <h1 className="font-display font-extrabold italic text-[42px] uppercase leading-none">Players</h1>
        </div>
        <div className="flex items-start gap-2">
          {canSend && (
            <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> Add Player
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 items-center flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-[320px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none" />
          <input
            className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-sm pl-9 pr-3 py-2 text-[14px] text-white placeholder:text-[#555] outline-none focus:border-brand transition-colors"
            placeholder="Search player or parent…"
            value={search}
            onChange={(e) => updateFilter('search', e.target.value)}
          />
        </div>

        {/* Status */}
        <select
          className="bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand min-w-[150px]"
          value={statusFilter}
          onChange={(e) => updateFilter('status', e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Team (admin/board only) */}
        {isAdmin && (
          <select
            className="bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand min-w-[160px]"
            value={teamFilter}
            onChange={(e) => updateFilter('teamId', e.target.value)}
          >
            <option value="">All teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        {/* Returning filter */}
        <label className="flex items-center gap-2 text-[13px] text-[#888] cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={returning}
            onChange={(e) => updateFilter('returning', e.target.checked)}
            className="w-4 h-4 rounded accent-brand"
          />
          Returning only
        </label>

        {/* Advanced filters button */}
        <button
          onClick={() => setAdvOpen((o) => !o)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-sm border text-[13px] transition-colors whitespace-nowrap',
            advActiveCount > 0 || advOpen
              ? 'bg-brand/10 border-brand/40 text-brand'
              : 'bg-[#1A1A1A] border-white/[0.08] text-[#888] hover:text-white hover:border-white/20',
          )}
        >
          <SlidersHorizontal size={13} />
          Filters
          {advActiveCount > 0 && (
            <span className="ml-0.5 w-4 h-4 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">
              {advActiveCount}
            </span>
          )}
        </button>
      </div>

      {/* Advanced filter panel */}
      {advOpen && (
        <div className="bg-[#141414] border border-white/[0.08] rounded-md p-5 flex flex-col gap-5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#555]">Advanced Filters</span>
            <div className="flex items-center gap-3">
              {advActiveCount > 0 && (
                <button
                  onClick={() => { setDobFrom(''); setDobTo(''); setGradeFilter(''); }}
                  className="text-[12px] text-[#555] hover:text-white transition-colors"
                >
                  Clear all
                </button>
              )}
              <button onClick={() => setAdvOpen(false)} className="text-[#555] hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* DOB range */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#666]">Birth Date Range</label>
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-[10px] text-[#555] uppercase tracking-widest">From</span>
                  <input
                    type="date"
                    className="bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand [color-scheme:dark] w-full"
                    value={dobFrom}
                    onChange={(e) => setDobFrom(e.target.value)}
                  />
                </div>
                <span className="text-[#444] mt-5">—</span>
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-[10px] text-[#555] uppercase tracking-widest">To</span>
                  <input
                    type="date"
                    className="bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand [color-scheme:dark] w-full"
                    value={dobTo}
                    onChange={(e) => setDobTo(e.target.value)}
                  />
                </div>
              </div>
              {(dobFrom || dobTo) && (
                <button onClick={() => { setDobFrom(''); setDobTo(''); }} className="text-[11px] text-[#555] hover:text-white self-start transition-colors">
                  Clear dates
                </button>
              )}
            </div>

            {/* Grade */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#666]">Grade</label>
              <select
                className="bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand"
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
              >
                <option value="">All grades</option>
                {[...new Set(players.map((p) => p.grade).filter(Boolean))].sort().map((g) => (
                  <option key={g} value={g!}>{g}</option>
                ))}
              </select>
              {gradeFilter && (
                <button onClick={() => setGradeFilter('')} className="text-[11px] text-[#555] hover:text-white self-start transition-colors">
                  Clear grade
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar — only visible when rows are selected */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#1A1A1A] border border-white/[0.08] rounded-sm flex-shrink-0">
          <span className="text-[13px] font-semibold text-white mr-1">
            {selected.size} player{selected.size !== 1 ? 's' : ''} selected
          </span>

          <div className="w-px h-4 bg-white/10" />

          {/* Bulk team assignment */}
          {isAdmin && teams.length > 0 && (
            <select
              className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-1.5 text-[13px] text-white outline-none focus:border-brand min-w-[180px]"
              defaultValue=""
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__remove__') { bulkAssignTeam(null); }
                else if (val) { bulkAssignTeam(val); }
                e.target.value = '';
              }}
            >
              <option value="" disabled>Assign team…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="__remove__">— Remove from team</option>
            </select>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost" size="sm"
              disabled={!canBulkWaitlist}
              onClick={bulkWaitlist}
            >
              Add to Waitlist
            </Button>
            <Button
              variant="danger" size="sm"
              disabled={!canBulkReject}
              onClick={() => openComposer('rejection', selectedArr)}
            >
              Send Rejection
            </Button>
            <Button
              variant="primary" size="sm"
              disabled={!canBulkOffer}
              onClick={() => openComposer('offer', selectedArr)}
            >
              Send Offer ({selected.size})
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-bg-secondary border border-white/[0.08] rounded-md overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#111] border-b-2 border-white/[0.12]">
              <th className="w-9 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded accent-brand"
                />
              </th>
              <th className="text-left px-3 py-3 text-[10px] font-bold tracking-[0.14em] uppercase text-[#666]">Player</th>
              <th className="text-left px-3 py-3 text-[10px] font-bold tracking-[0.14em] uppercase text-[#666]">Team Offer</th>
              <th className="text-left px-3 py-3 text-[10px] font-bold tracking-[0.14em] uppercase text-[#666]">Parent / Guardian</th>
              <th className="text-left px-3 py-3 text-[10px] font-bold tracking-[0.14em] uppercase text-[#666]">Status</th>
              <th className="text-left px-3 py-3 text-[10px] font-bold tracking-[0.14em] uppercase text-[#666]">Last Activity</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-[#555]">
                  <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                  <div>Loading players…</div>
                </td>
              </tr>
            ) : noActiveSeason ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-[#555]">
                  <div className="text-[16px] font-semibold mb-2 text-[#888]">No active season</div>
                  <div className="text-[13px] mb-3">Players are scoped to the active season. Set one up first.</div>
                  <a href="/settings/seasons" className="text-brand text-[13px] underline underline-offset-2">
                    Go to Settings → Seasons
                  </a>
                </td>
              </tr>
            ) : visiblePlayers.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-[#555]">
                  <div className="text-[16px] font-semibold mb-1 text-[#444]">No players match</div>
                  <div className="text-[13px]">Try adjusting filters or adding players manually.</div>
                </td>
              </tr>
            ) : (
              visiblePlayers.map((p) => {
                const lastTs = p.latestOffer?.acceptedAt
                  ?? p.latestOffer?.declinedAt
                  ?? p.latestOffer?.openedAt
                  ?? p.latestOffer?.sentAt
                  ?? p.createdAt;
                return (
                  <tr
                    key={p.id}
                    onClick={() => setDetailId(p.id)}
                    className={cn(
                      'border-b border-white/[0.05] cursor-pointer transition-colors',
                      selected.has(p.id) ? 'bg-brand/[0.07]' : 'hover:bg-white/[0.02]',
                    )}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        className="w-4 h-4 rounded accent-brand"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#242424] flex items-center justify-center font-display font-extrabold italic text-[12px] text-white flex-shrink-0">
                          {initials(p.firstName, p.lastName)}
                        </div>
                        <div>
                          <div className="font-semibold text-[14px]">{p.firstName} {p.lastName}</div>
                          <div className="text-[11px] text-[#555]">
                            {p.dateOfBirth
                              ? `Born ${fmtBirthDate(p.dateOfBirth)}`
                              : p.ageOverride
                              ? `Age ${p.ageOverride}`
                              : ''}
                            {p.grade ? ` · Grade ${p.grade}` : ''}
                            {seasonLabel(p.seasonId)
                              ? `${p.dateOfBirth || p.ageOverride || p.grade ? ' · ' : ''}${seasonLabel(p.seasonId)}`
                              : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-[#AAA]">{teamName(p.teamId)}</td>
                    <td className="px-3 py-3">
                      <div className="text-[12px]">{p.parentName ?? '—'}</div>
                      <div className="text-[11px] text-[#555]">{p.parentEmail}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={p.status} />
                        {p.isReturning && (
                          <span className="text-[9px] font-bold tracking-[0.08em] uppercase px-1 py-0.5 rounded bg-[#6BAEFF]/10 text-[#6BAEFF] border border-[#6BAEFF]/20">R</span>
                        )}
                        {p.earlyOfferEligible && (
                          <span className="text-[9px] font-bold tracking-[0.08em] uppercase px-1 py-0.5 rounded bg-brand/10 text-[#E07070] border border-brand/20">EO</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-[#666]">{fmtRelative(lastTs)}</td>
                    <td className="px-3 py-3 text-[#444]">
                      <ChevronRight size={14} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <AddPlayerModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} />
      <PlayerDetailModal
        open={!!detailId} playerId={detailId}
        onClose={() => setDetailId(null)}
        onRefresh={load}
        onOpenComposer={openComposer}
      />
      <ComposerModal
        open={composer.open}
        mode={composer.mode}
        initialIds={composer.ids}
        onClose={() => setComposer((c) => ({ ...c, open: false }))}
        onSent={() => { load(); setSelected(new Set()); }}
      />
    </div>
  );
}
