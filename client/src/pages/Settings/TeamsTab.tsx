import { useState, useEffect, useCallback } from 'react';
import { Plus, ChevronDown, ChevronUp, Users, Download, Upload, CheckCircle2, RefreshCw, Trash2, ArchiveIcon } from 'lucide-react';
import { teamsApi, usersApi, seExplorerApi, seasonsApi, divisionsApi, type TeamRow, type TeamCoach, type UserRow, type SEImportTeamsResult, type SEImportTeamEntry, type SESeasonStatus, type SeasonRow, type DivisionRow } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { CsvImportModal } from '@/components/modals/CsvImportModal';

// ─── Team Form ────────────────────────────────────────────────────────────────

interface TeamFormProps {
  initial?: TeamRow | null;
  onSave: (data: { name: string; divisionId?: string | null; seasonId?: string | null }) => Promise<void>;
  onClose: () => void;
}

function TeamForm({ initial, onSave, onClose }: TeamFormProps) {
  const [name,       setName]       = useState(initial?.name       ?? '');
  const [divisionId, setDivisionId] = useState<string>(initial?.divisionId ?? '');
  const [seasonId,   setSeasonId]   = useState<string>(initial?.seasonId   ?? '');
  const [seasons,    setSeasons]    = useState<SeasonRow[]>([]);
  const [divisions,  setDivisions]  = useState<DivisionRow[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    seasonsApi.list().then((r) => setSeasons(r.seasons.filter((s) => !s.isArchived))).catch(() => {});
  }, []);

  // Reload divisions whenever the selected season changes
  useEffect(() => {
    if (!seasonId) { setDivisions([]); setDivisionId(''); return; }
    divisionsApi.listBySeason(seasonId)
      .then((r) => {
        setDivisions(r.divisions.filter((d) => d.isActive));
        // Clear divisionId if it no longer belongs to the new season
        setDivisionId((prev) => r.divisions.some((d) => d.id === prev) ? prev : '');
      })
      .catch(() => {});
  }, [seasonId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name,
        divisionId: divisionId || null,
        seasonId:   seasonId   || null,
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to save.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1A1A1A] border border-white/[0.08] rounded-md w-full max-w-sm">
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <h2 className="font-display font-extrabold italic text-[22px] uppercase">
            {initial ? 'Edit Team' : 'New Team'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <Input
            label="Team Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 12U Gold"
            required
          />
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#888]">
              Season (optional)
            </label>
            <select
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              className="w-full bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand"
            >
              <option value="">— No season —</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}{s.isActive ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#888]">
              Division (optional)
            </label>
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              disabled={!seasonId || divisions.length === 0}
              className="w-full bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <option value="">— No division —</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {seasonId && divisions.length === 0 && (
              <p className="text-[11px] text-[#555]">No divisions configured for this season yet.</p>
            )}
            {!seasonId && (
              <p className="text-[11px] text-[#555]">Select a season first to choose a division.</p>
            )}
          </div>
          {/* SE ID — read-only, shown only for SE-imported teams */}
          {initial?.seId && (
            <div className="space-y-1.5 pt-1 border-t border-white/[0.06]">
              <label className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#555]">
                SportsEngine ID
              </label>
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-sm px-3 py-2">
                <span className="text-[12px] text-[#555] font-mono flex-1 select-all">{initial.seId}</span>
                <span className="text-[10px] text-[#444] uppercase tracking-wider shrink-0">Read only</span>
              </div>
            </div>
          )}

          {error && <p className="text-[12px] text-[#E07070]">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Team'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Coach Assignment Panel ───────────────────────────────────────────────────

interface CoachPanelProps {
  teamId:    string;
  allUsers:  UserRow[];
}

function CoachPanel({ teamId, allUsers }: CoachPanelProps) {
  const [coaches,  setCoaches]  = useState<TeamCoach[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const coachUsers = allUsers.filter((u) =>
    u.isActive && (u.role === 'head_coach' || u.role === 'assistant_coach'),
  );

  useEffect(() => {
    async function load() {
      try {
        const { coaches: c } = await teamsApi.coaches(teamId);
        setCoaches(c);
      } catch {}
      setLoading(false);
    }
    load();
  }, [teamId]);

  function isAssigned(userId: string) {
    return coaches.some((c) => c.userId === userId);
  }

  function getRoleAt(userId: string): 'head_coach' | 'assistant_coach' {
    return coaches.find((c) => c.userId === userId)?.roleAtTeam ?? 'assistant_coach';
  }

  function toggleCoach(user: UserRow) {
    if (isAssigned(user.id)) {
      setCoaches((c) => c.filter((x) => x.userId !== user.id));
    } else {
      setCoaches((c) => [...c, { userId: user.id, roleAtTeam: user.role as 'head_coach' | 'assistant_coach' }]);
    }
  }

  function setRole(userId: string, role: 'head_coach' | 'assistant_coach') {
    setCoaches((c) => c.map((x) => x.userId === userId ? { ...x, roleAtTeam: role } : x));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await teamsApi.setCoaches(teamId, coaches);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to save assignments.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-[#555] text-[12px] py-2">Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-bold tracking-widest uppercase text-[#555]">Coach Assignments</div>
      {coachUsers.length === 0 && (
        <p className="text-[12px] text-[#555]">No coach accounts yet. Invite coaches from the Users tab.</p>
      )}
      <div className="space-y-1.5">
        {coachUsers.map((u) => (
          <div key={u.id} className="flex items-center gap-3">
            <label className="flex items-center gap-2 flex-1 cursor-pointer text-[13px] text-[#CCC]">
              <input
                type="checkbox"
                checked={isAssigned(u.id)}
                onChange={() => toggleCoach(u)}
                className="accent-brand"
              />
              {u.fullName}
              <span className="text-[#555] text-[11px]">{u.email}</span>
            </label>
            {isAssigned(u.id) && (
              <select
                value={getRoleAt(u.id)}
                onChange={(e) => setRole(u.id, e.target.value as 'head_coach' | 'assistant_coach')}
                className="bg-[#252525] border border-white/[0.08] rounded-sm px-2 py-1 text-[12px] text-[#CCC] outline-none focus:border-brand"
              >
                <option value="head_coach">Head Coach</option>
                <option value="assistant_coach">Asst Coach</option>
              </select>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 pt-1">
        <Button variant="outline" size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Assignments'}
        </Button>
        {saved  && <span className="text-[12px] text-green-400">Saved.</span>}
        {error  && <span className="text-[12px] text-[#E07070]">{error}</span>}
      </div>
    </div>
  );
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

interface ConfirmDeleteModalProps {
  mode: 'bulk' | 'reset';
  count?: number;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}

function ConfirmDeleteModal({ mode, count, onConfirm, onClose, loading }: ConfirmDeleteModalProps) {
  const [typed, setTyped] = useState('');
  const isReset = mode === 'reset';
  const confirmed = !isReset || typed === 'DELETE';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1A1A1A] border border-white/10 rounded-xl w-full max-w-md shadow-2xl p-6 space-y-4">
        <h3 className="font-display font-extrabold italic uppercase text-[18px] text-[#E07070]">
          {isReset ? 'Reset All Teams' : `Delete ${count} Team${count !== 1 ? 's' : ''}`}
        </h3>

        {isReset ? (
          <>
            <p className="text-[13px] text-[#888]">
              This will permanently delete <strong className="text-white">all teams</strong>.
              Players will be unassigned but not deleted. This cannot be undone.
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-[#555]">
                Type <strong className="text-white">DELETE</strong> to confirm
              </label>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="DELETE"
                className="w-full bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none focus:border-[#E07070] font-mono"
                autoFocus
              />
            </div>
          </>
        ) : (
          <p className="text-[13px] text-[#888]">
            Permanently delete <strong className="text-white">{count} team{count !== 1 ? 's' : ''}</strong>?
            Players will be unassigned but not deleted. This cannot be undone.
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={loading} className="flex-1">Cancel</Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={!confirmed || loading}
            className="flex-1 bg-[#E07070] hover:bg-[#C05050] border-transparent text-white"
          >
            {loading ? 'Deleting…' : isReset ? 'Reset All Teams' : `Delete ${count} Team${count !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Team Card ────────────────────────────────────────────────────────────────

interface TeamCardProps {
  team:         TeamRow;
  allUsers:     UserRow[];
  seasonLabel?:   string;
  divisionLabel?: string;
  onEdit:         () => void;
  onDeactivate: () => void;
  onActivate:   () => void;
  onDelete:     () => void;
  selected:     boolean;
  onToggle:     () => void;
}

function TeamCard({ team, allUsers, seasonLabel, divisionLabel, onEdit, onDeactivate, onActivate, onDelete, selected, onToggle }: TeamCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      'border rounded-sm overflow-hidden',
      team.isActive ? 'border-white/[0.08]' : 'border-white/[0.04] opacity-60',
    )}>
      {/* Clickable row — opens edit modal */}
      <div
        className="flex items-center px-4 py-3 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-colors"
        onClick={onEdit}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="accent-brand w-4 h-4 shrink-0 cursor-pointer mr-3"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold italic text-[15px] uppercase text-white">{team.name}</span>
            {divisionLabel && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-brand/10 text-[#E07070] border border-brand/20">{divisionLabel}</span>
            )}
            {seasonLabel && (
              <span className="text-[11px] text-[#444] border border-white/[0.06] rounded px-1.5 py-0.5">{seasonLabel}</span>
            )}
            {!team.isActive && <span className="text-[10px] font-bold tracking-widest uppercase text-[#555]">Archived</span>}
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {team.isActive ? (
            <button
              onClick={onDeactivate}
              className="p-1.5 text-[#555] hover:text-yellow-400 transition-colors"
              title="Archive team"
            >
              <ArchiveIcon size={13} />
            </button>
          ) : (
            <button
              onClick={onActivate}
              className="p-1.5 text-[#555] hover:text-green-400 transition-colors"
              title="Restore team"
            >
              <CheckCircle2 size={13} />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1.5 text-[#555] hover:text-[#E07070] transition-colors"
            title="Delete team"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((o) => !o); }}
            className="p-1.5 text-[#555] hover:text-white transition-colors flex items-center gap-1"
          >
            <Users size={13} />
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-4 border-t border-white/[0.06]">
          <CoachPanel teamId={team.id} allUsers={allUsers} />
        </div>
      )}
    </div>
  );
}

// ─── SE Import Modal ──────────────────────────────────────────────────────────

function TeamCheckRow({ entry, checked, onChange, color }: {
  entry: SEImportTeamEntry; checked: boolean; onChange: (v: boolean) => void; color: string;
}) {
  return (
    <label className="flex items-center gap-3 py-1.5 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-brand w-3.5 h-3.5 shrink-0"
      />
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
      <span className="text-[13px] text-white flex-1 group-hover:text-white/90">
        {entry.name}
        {entry.division ? <span className="text-[#888]"> — {entry.division}</span> : null}
      </span>
      {entry.season && (
        <span className="text-[11px] text-[#555] shrink-0">{entry.season}</span>
      )}
    </label>
  );
}

function SEImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [stage,    setStage]    = useState<'idle' | 'previewing' | 'preview' | 'seasons' | 'importing' | 'done' | 'error'>('idle');
  const [preview,  setPreview]  = useState<SEImportTeamsResult | null>(null);
  const [result,   setResult]   = useState<SEImportTeamsResult | null>(null);
  const [errMsg,   setErrMsg]   = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Season resolution: for each unique SE season found in selected teams, track
  // whether we create it (true) or skip assigning it (false). null = existing.
  const [seasonResolution, setSeasonResolution] = useState<Map<string, 'create' | 'skip'>>(new Map());

  async function runPreview() {
    setStage('previewing');
    setErrMsg(null);
    try {
      const res = await seExplorerApi.importTeamsPreview();
      setPreview(res);
      const all = [...res.created, ...res.updated].map((t) => t.seId);
      setSelected(new Set(all));
      setStage('preview');
    } catch (e: unknown) {
      setErrMsg((e as Error).message);
      setStage('error');
    }
  }

  // Called when the user clicks "Continue" from the team selection step
  async function proceedToSeasonCheck() {
    if (!preview) return;
    // Re-fetch a fresh preview (preview-only, no selectedIds) to get up-to-date seasonStatus.
    // This avoids stale appSeasonId=null for seasons that were created since the last preview.
    let freshStatus = preview.seasonStatus ?? [];
    try {
      const fresh = await seExplorerApi.importTeamsPreview();
      freshStatus = fresh.seasonStatus ?? [];
      // Merge into preview so the rest of the flow uses fresh data
      setPreview((p) => p ? { ...p, seasonStatus: freshStatus } : p);
    } catch { /* non-critical — fall back to cached status */ }

    // Only consider seasons referenced by currently selected teams
    const selectedTeams = allEntries.filter((t) => selected.has(t.seId));
    const missingSeasons = freshStatus.filter((s) => {
      if (s.appSeasonId) return false;
      return selectedTeams.some((t) => t.season === s.seLabel);
    });

    if (missingSeasons.length === 0) {
      runCommit(freshStatus);
    } else {
      const defaults = new Map<string, 'create' | 'skip'>();
      missingSeasons.forEach((s) => defaults.set(s.seLabel, 'create'));
      setSeasonResolution(defaults);
      setStage('seasons');
    }
  }

  async function runCommit(seasonStatus: SESeasonStatus[]) {
    setStage('importing');
    try {
      // Build seasonMappings: existing seasons pass appSeasonId, new ones pass only seLabel
      const seasonMappings = seasonStatus
        .filter((s) => {
          if (s.appSeasonId) return true;              // existing — always map
          return seasonResolution.get(s.seLabel) === 'create'; // missing — only if user chose create
        })
        .map((s) => ({ seLabel: s.seLabel, appSeasonId: s.appSeasonId ?? undefined }));

      const res = await seExplorerApi.importTeamsCommit([...selected], seasonMappings);
      setResult(res);
      setStage('done');
      onImported();
    } catch (e: unknown) {
      setErrMsg((e as Error).message);
      setStage('error');
    }
  }

  function toggleTeam(seId: string, checked: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      checked ? n.add(seId) : n.delete(seId);
      return n;
    });
  }

  const allEntries  = preview ? [...preview.created, ...preview.updated] : [];
  const allSelected = allEntries.length > 0 && allEntries.every((t) => selected.has(t.seId));
  const noneSelected = selected.size === 0;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allEntries.map((t) => t.seId)));
  }

  // Seasons that are missing and referenced by currently-selected teams
  const missingSeasonsForSelected = (preview?.seasonStatus ?? []).filter((s) => {
    if (s.appSeasonId) return false;
    const selectedTeams = allEntries.filter((t) => selected.has(t.seId));
    return selectedTeams.some((t) => t.season === s.seLabel);
  });

  // Safety: if we reach the seasons step but there's nothing to resolve, auto-commit
  useEffect(() => {
    if (stage === 'seasons' && missingSeasonsForSelected.length === 0 && preview) {
      runCommit(preview.seasonStatus ?? []);
    }
  }, [stage, missingSeasonsForSelected.length]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1A1A1A] border border-white/10 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between shrink-0">
          <h3 className="font-display font-extrabold italic uppercase text-[16px]">Import Teams from SportsEngine</h3>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors text-lg leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {stage === 'idle' && (
            <>
              <p className="text-[13px] text-[#888]">
                Fetches all active teams from SportsEngine. Review and select which teams to import before confirming.
              </p>
              <Button variant="primary" onClick={runPreview} className="w-full">
                <Download size={13} /> Preview Teams from SE
              </Button>
            </>
          )}

          {stage === 'previewing' && (
            <div className="flex items-center gap-2 text-[#888] text-[13px]">
              <RefreshCw size={13} className="animate-spin" /> Fetching from SportsEngine…
            </div>
          )}

          {stage === 'preview' && preview && (
            <>
              {/* Summary line */}
              <p className="text-[13px] text-[#888]">{preview.message}</p>

              {allEntries.length > 0 && (
                <div className="space-y-1">
                  {/* Select-all row */}
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 cursor-pointer text-[12px] text-[#888]">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-brand w-3.5 h-3.5" />
                      {allSelected ? 'Deselect all' : 'Select all'}
                    </label>
                    <span className="text-[11px] text-[#555]">{selected.size} of {allEntries.length} selected</span>
                  </div>

                  {/* New teams */}
                  {preview.created.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#555] mb-1">
                        New — will be created ({preview.created.length})
                      </p>
                      {preview.created.map((t) => (
                        <TeamCheckRow key={t.seId} entry={t} checked={selected.has(t.seId)}
                          onChange={(v) => toggleTeam(t.seId, v)} color="bg-green-400" />
                      ))}
                    </div>
                  )}

                  {/* Division updates */}
                  {preview.updated.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#555] mb-1">
                        Division update ({preview.updated.length})
                      </p>
                      {preview.updated.map((t) => (
                        <TeamCheckRow key={t.seId} entry={t} checked={selected.has(t.seId)}
                          onChange={(v) => toggleTeam(t.seId, v)} color="bg-yellow-400" />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Unchanged (collapsed list) */}
              {preview.skipped.length > 0 && (
                <p className="text-[11px] text-[#444]">
                  {preview.skipped.length} team{preview.skipped.length !== 1 ? 's' : ''} already up to date — skipped
                </p>
              )}
            </>
          )}

          {/* ── Season resolution step ── */}
          {stage === 'seasons' && (
            <div className="space-y-4">
              <div>
                <p className="text-[13px] text-white font-semibold mb-1">Season setup required</p>
                <p className="text-[12px] text-[#888]">
                  The following seasons from SportsEngine don't exist in the app yet.
                  Choose whether to create each one so teams are correctly associated.
                </p>
              </div>
              {missingSeasonsForSelected.map((s) => (
                <div key={s.seLabel} className="bg-white/[0.04] border border-white/[0.08] rounded-md p-4 space-y-2">
                  <p className="text-[13px] text-white font-medium">{s.seLabel}</p>
                  <p className="text-[11px] text-[#555]">Not found in app seasons</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSeasonResolution((m) => { const n = new Map(m); n.set(s.seLabel, 'create'); return n; })}
                      className={`flex-1 py-1.5 rounded text-[12px] font-semibold border transition-colors ${
                        seasonResolution.get(s.seLabel) === 'create'
                          ? 'bg-brand border-brand text-white'
                          : 'border-white/[0.12] text-[#888] hover:border-brand/50'
                      }`}
                    >
                      ✓ Create season
                    </button>
                    <button
                      onClick={() => setSeasonResolution((m) => { const n = new Map(m); n.set(s.seLabel, 'skip'); return n; })}
                      className={`flex-1 py-1.5 rounded text-[12px] font-semibold border transition-colors ${
                        seasonResolution.get(s.seLabel) === 'skip'
                          ? 'bg-white/[0.1] border-white/30 text-white'
                          : 'border-white/[0.12] text-[#888] hover:border-white/30'
                      }`}
                    >
                      Skip (no season link)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {stage === 'importing' && (
            <div className="flex items-center gap-2 text-[#888] text-[13px]">
              <RefreshCw size={13} className="animate-spin" /> Importing…
            </div>
          )}

          {stage === 'done' && result && (
            <div className="flex items-center gap-2 text-green-400 text-[13px]">
              <CheckCircle2 size={15} /> {result.message}
            </div>
          )}

          {stage === 'error' && (
            <p className="text-[13px] text-[#E07070]">{errMsg}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0">
          {(stage === 'idle' || stage === 'previewing' || stage === 'error') && (
            <div className="flex gap-3">
              <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
              {stage === 'error' && (
                <Button variant="outline" onClick={runPreview} className="flex-1">Retry</Button>
              )}
            </div>
          )}
          {stage === 'preview' && preview && (
            allEntries.length === 0 ? (
              <Button variant="outline" onClick={onClose} className="w-full">Close — Nothing to import</Button>
            ) : (
              <div className="flex gap-3">
                <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
                <Button variant="primary" onClick={proceedToSeasonCheck} disabled={noneSelected} className="flex-1">
                  Continue ({selected.size} team{selected.size !== 1 ? 's' : ''})
                </Button>
              </div>
            )
          )}
          {stage === 'seasons' && preview && (
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setStage('preview')} className="flex-1">Back</Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={missingSeasonsForSelected.some((s) => !seasonResolution.get(s.seLabel))}
                onClick={() => runCommit(preview.seasonStatus ?? [])}
              >
                Confirm Import ({selected.size})
              </Button>
            </div>
          )}
          {stage === 'done' && (
            <Button variant="primary" onClick={onClose} className="w-full">Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function TeamsTab() {
  const [teams,        setTeams]        = useState<TeamRow[]>([]);
  const [users,        setUsers]        = useState<UserRow[]>([]);
  const [allSeasons,   setAllSeasons]   = useState<SeasonRow[]>([]);
  const [allDivisions, setAllDivisions] = useState<DivisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [modal,   setModal]   = useState<{ type: 'new' } | { type: 'edit'; team: TeamRow } | { type: 'delete'; team: TeamRow } | null>(null);
  const [deleteErr,   setDeleteErr]   = useState<string | null>(null);
  const [deletingOne, setDeletingOne] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState<'bulk' | 'reset' | null>(null);
  const [deleting,    setDeleting]    = useState(false);

  // Filters
  const [search,       setSearch]       = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [ageFilter,    setAgeFilter]    = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, u, s] = await Promise.all([teamsApi.list(), usersApi.list(), seasonsApi.list()]);
      setTeams(t.teams.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) || a.name.localeCompare(b.name)));
      setUsers(u.users);
      setAllSeasons(s.seasons);
      // Load divisions for all non-archived seasons so we can look up names
      const activeSeason = s.seasons.find((ss) => ss.isActive);
      if (activeSeason) {
        divisionsApi.listBySeason(activeSeason.id)
          .then((r) => setAllDivisions(r.divisions))
          .catch(() => {});
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Unique seasons and age groups present in the loaded teams (for filter dropdowns)
  const seasonMap   = new Map(allSeasons.map((s) => [s.id, s.label]));
  const divisionMap = new Map(allDivisions.map((d) => [d.id, d.name]));
  const seasonOptions = Array.from(
    new Set(teams.map((t) => t.seasonId).filter(Boolean) as string[])
  ).map((id) => ({ id, label: seasonMap.get(id) ?? id }))
   .sort((a, b) => a.label.localeCompare(b.label));

  const ageOptions = Array.from(
    new Set(teams.map((t) => t.division).filter(Boolean) as string[])
  ).sort();

  const filteredTeams = teams.filter((t) => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (seasonFilter && t.seasonId !== seasonFilter) return false;
    if (ageFilter && t.division !== ageFilter) return false;
    return true;
  });

  async function handleCreate(data: { name: string; divisionId?: string | null; seasonId?: string | null }) {
    await teamsApi.create(data);
    await load();
  }

  async function handleUpdate(id: string, data: { name: string; divisionId?: string | null; seasonId?: string | null }) {
    await teamsApi.update(id, data);
    await load();
  }

  async function handleDeleteOne(id: string) {
    setDeletingOne(true);
    setDeleteErr(null);
    try {
      await teamsApi.delete(id);
      setModal(null);
      await load();
    } catch (err: unknown) {
      setDeleteErr((err as Error).message ?? 'Failed to delete team.');
    } finally {
      setDeletingOne(false);
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      if (showConfirm === 'bulk') {
        await teamsApi.bulkDelete([...selected]);
        setSelected(new Set());
      } else {
        await teamsApi.deleteAll();
        setSelected(new Set());
      }
      setShowConfirm(null);
      await load();
    } catch (err: unknown) {
      setError((err as Error).message);
      setShowConfirm(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-extrabold italic text-[22px] uppercase">Teams</h2>
          <p className="text-[12px] text-[#666] mt-0.5">Manage teams and coach assignments.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button variant="danger" size="sm" onClick={() => setShowConfirm('bulk')}>
              <Trash2 size={13} />Delete Selected ({selected.size})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowConfirm('reset')}
            className="text-[#E07070] border-[#E07070]/30 hover:bg-[#E07070]/10">
            <Trash2 size={13} />Reset All
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Download size={13} />Import from SE
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCsvImport(true)}>
            <Upload size={13} />Import from CSV
          </Button>
          <Button variant="primary" size="sm" onClick={() => setModal({ type: 'new' })}>
            <Plus size={13} />New Team
          </Button>
        </div>
      </div>

      {error && <p className="text-[13px] text-[#E07070]">{error}</p>}

      {/* Filter bar */}
      {!loading && teams.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-sm pl-9 pr-3 py-2 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-brand transition-colors"
              placeholder="Search teams…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Season filter */}
          {seasonOptions.length > 0 && (
            <select
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value)}
              className="bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand min-w-[160px]"
            >
              <option value="">All seasons</option>
              {seasonOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          )}

          {/* Age group filter */}
          {ageOptions.length > 0 && (
            <select
              value={ageFilter}
              onChange={(e) => setAgeFilter(e.target.value)}
              className="bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand min-w-[130px]"
            >
              <option value="">All age groups</option>
              {ageOptions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}

          {/* Active filter indicator */}
          {(search || seasonFilter || ageFilter) && (
            <button
              onClick={() => { setSearch(''); setSeasonFilter(''); setAgeFilter(''); }}
              className="text-[11px] text-[#555] hover:text-white transition-colors"
            >
              Clear filters
            </button>
          )}

          <span className="ml-auto text-[11px] text-[#555]">
            {filteredTeams.length} of {teams.length} teams
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-[#555] text-sm">Loading…</div>
      ) : (
        <div className="space-y-3">
          {filteredTeams.map((t) => (
            <TeamCard
              key={t.id}
              team={t}
              allUsers={users}
              seasonLabel={t.seasonId ? seasonMap.get(t.seasonId) : undefined}
              divisionLabel={t.divisionId ? divisionMap.get(t.divisionId) : undefined}
              onEdit={()       => setModal({ type: 'edit', team: t })}
              onDeactivate={async () => { await teamsApi.deactivate(t.id); await load(); }}
              onActivate={async ()   => { await teamsApi.activate(t.id);   await load(); }}
              onDelete={()     => { setDeleteErr(null); setModal({ type: 'delete', team: t }); }}
              selected={selected.has(t.id)}
              onToggle={() => setSelected(s => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })}
            />
          ))}
          {filteredTeams.length === 0 && (
            <div className="text-[#555] text-sm text-center py-8">
              {teams.length === 0 ? 'No teams yet.' : 'No teams match the current filters.'}
            </div>
          )}
        </div>
      )}

      {modal?.type === 'new' && (
        <TeamForm onSave={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'edit' && (
        <TeamForm
          initial={modal.team}
          onSave={(data) => handleUpdate(modal.team.id, data)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-[#1A1A1A] border border-white/[0.08] rounded-md w-full max-w-sm p-6 space-y-4">
            <h2 className="font-display font-extrabold italic text-[20px] uppercase text-white">Delete Team</h2>
            <p className="text-[13px] text-[#888]">
              Permanently delete <span className="text-white font-semibold">{modal.team.name}</span>?
              This removes the team and all coach assignments. Players assigned to this team will be unlinked.
            </p>
            <p className="text-[12px] text-[#888]">
              To keep the team but remove it from active use, archive it instead.
            </p>
            {deleteErr && <p className="text-[12px] text-[#E07070]">{deleteErr}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={() => setModal(null)} disabled={deletingOne}>Cancel</Button>
              <Button variant="ghost" size="sm"
                onClick={async () => { await teamsApi.deactivate(modal.team.id); setModal(null); await load(); }}
                disabled={deletingOne}
                className="text-yellow-400 hover:text-yellow-300"
              >
                <ArchiveIcon size={12} /> Archive instead
              </Button>
              <Button variant="danger" onClick={() => handleDeleteOne(modal.team.id)} disabled={deletingOne}>
                {deletingOne ? 'Deleting…' : 'Delete Team'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {showImport && (
        <SEImportModal
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}
      {showCsvImport && (
        <CsvImportModal
          mode="teams"
          onClose={() => setShowCsvImport(false)}
          onImported={load}
        />
      )}
      {showConfirm && (
        <ConfirmDeleteModal
          mode={showConfirm}
          count={showConfirm === 'bulk' ? selected.size : undefined}
          onConfirm={handleConfirmDelete}
          onClose={() => setShowConfirm(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
