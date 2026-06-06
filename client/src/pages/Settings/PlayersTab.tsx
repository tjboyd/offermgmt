import { useState, useEffect, useCallback } from 'react';
import { Plus, Download, Upload, Trash2, RefreshCw, CheckCircle2, AlertTriangle, GitMerge, X } from 'lucide-react';
import {
  playersAdminApi, playersApi, seExplorerApi, seasonsApi,
  type PlayerRow, type SeasonRow,
  type SEImportPlayerEntry, type SEImportPlayerDuplicate,
  type SEImportPlayersPreviewResult,
} from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { AddPlayerModal } from '@/components/modals/AddPlayerModal';
import { CsvImportModal } from '@/components/modals/CsvImportModal';

function fmtDob(raw: string | null): string {
  if (!raw) return '—';
  // Handle both ISO timestamps (2014-12-20T00:00:00.000Z) and date strings (2014-12-20)
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// ─── Confirm Delete All Modal ─────────────────────────────────────────────────

function ConfirmDeleteSeasonModal({
  seasonLabel,
  count,
  onConfirm,
  onClose,
  loading,
}: {
  seasonLabel: string;
  count: number;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [typed, setTyped] = useState('');
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1A1A1A] border border-white/10 rounded-xl w-full max-w-md shadow-2xl p-6 space-y-4">
        <h3 className="font-display font-extrabold italic uppercase text-[18px] text-[#E07070]">
          Delete All Players in Season
        </h3>
        <p className="text-[13px] text-[#888]">
          Permanently delete all <strong className="text-white">{count} player{count !== 1 ? 's' : ''}</strong> in{' '}
          <strong className="text-white">{seasonLabel}</strong>?
          This also removes all their offers and activity history. This cannot be undone.
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
        <div className="flex gap-3 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={loading} className="flex-1">Cancel</Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={typed !== 'DELETE' || loading}
            className="flex-1 bg-[#E07070] hover:bg-[#C05050] border-transparent text-white"
          >
            {loading ? 'Deleting…' : `Delete ${count} Player${count !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── SE Import Modal ──────────────────────────────────────────────────────────

type ImportStage = 'configure' | 'fetching' | 'preview' | 'importing' | 'done' | 'error';

function SEPlayerImportModal({
  seasons,
  onClose,
  onImported,
}: {
  seasons: SeasonRow[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [stage,          setStage]          = useState<ImportStage>('configure');
  const [seasonId,       setSeasonId]       = useState('');
  const [registrationId, setRegistrationId] = useState('');
  const [preview,        setPreview]        = useState<SEImportPlayersPreviewResult | null>(null);
  const [errMsg,         setErrMsg]         = useState<string | null>(null);
  const [doneMsg,        setDoneMsg]        = useState<string | null>(null);

  // Checkboxes: selected profile IDs to import
  const [selectedNew,  setSelectedNew]  = useState<Set<string>>(new Set());
  const [selectedDups, setSelectedDups] = useState<Set<string>>(new Set());

  // Pre-fill registration ID when season changes
  useEffect(() => {
    const s = seasons.find((s) => s.id === seasonId);
    if (s?.seRegistrationId) setRegistrationId(s.seRegistrationId);
  }, [seasonId, seasons]);

  async function runPreview() {
    if (!seasonId || !registrationId.trim()) return;
    setStage('fetching');
    setErrMsg(null);
    try {
      const res = await seExplorerApi.importPlayersPreview(registrationId.trim(), seasonId);
      setPreview(res);
      setSelectedNew(new Set(res.toCreate.map((p) => p.profileId)));
      setSelectedDups(new Set()); // duplicates opt-in: off by default
      setStage('preview');
    } catch (e: unknown) {
      setErrMsg((e as Error).message);
      setStage('error');
    }
  }

  async function runCommit() {
    if (!preview) return;
    setStage('importing');
    try {
      const selectedIds = [...selectedNew, ...selectedDups];
      const res = await seExplorerApi.importPlayersCommit(registrationId.trim(), seasonId, selectedIds);
      setDoneMsg(res.message);
      setStage('done');
      onImported();
    } catch (e: unknown) {
      setErrMsg((e as Error).message);
      setStage('error');
    }
  }

  function toggleNew(profileId: string, checked: boolean) {
    setSelectedNew((s) => { const n = new Set(s); checked ? n.add(profileId) : n.delete(profileId); return n; });
  }
  function toggleDup(profileId: string, checked: boolean) {
    setSelectedDups((s) => { const n = new Set(s); checked ? n.add(profileId) : n.delete(profileId); return n; });
  }

  const allNewSelected  = (preview?.toCreate.length ?? 0) > 0 && preview!.toCreate.every((p) => selectedNew.has(p.profileId));
  const totalSelected   = selectedNew.size + selectedDups.size;

  const nonArchivedSeasons = seasons.filter((s) => !s.isArchived);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1A1A1A] border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between shrink-0">
          <h3 className="font-display font-extrabold italic uppercase text-[16px]">Import Players from SportsEngine</h3>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

          {/* ── Configure ── */}
          {(stage === 'configure' || stage === 'error') && (
            <>
              <p className="text-[13px] text-[#888]">
                Fetches all profiles who submitted a specific SE registration form. Review and select which players to import.
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#888]">Season</label>
                  <select
                    value={seasonId}
                    onChange={(e) => setSeasonId(e.target.value)}
                    className="w-full bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand"
                  >
                    <option value="">— Select a season —</option>
                    {nonArchivedSeasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}{s.isActive ? ' (active)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Input
                    label="SE Registration ID"
                    value={registrationId}
                    onChange={(e) => setRegistrationId(e.target.value)}
                    placeholder="e.g. 46575456"
                  />
                  <p className="text-[11px] text-[#555]">Find this in SportsEngine under your registration form URL (e.g. sportngin.com/register/form/<strong>46575456</strong>).</p>
                </div>
                {stage === 'error' && errMsg && (
                  <p className="text-[13px] text-[#E07070]">{errMsg}</p>
                )}
              </div>
            </>
          )}

          {/* ── Fetching ── */}
          {stage === 'fetching' && (
            <div className="flex items-center gap-2 text-[#888] text-[13px] py-4">
              <RefreshCw size={14} className="animate-spin" />
              Fetching profiles from SportsEngine… This may take a moment for large registrations.
            </div>
          )}

          {/* ── Preview ── */}
          {stage === 'preview' && preview && (
            <>
              <div className="text-[13px] text-[#AAA]">{preview.message}</div>

              {/* New players */}
              {preview.toCreate.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#555]">
                      New players — will be created ({preview.toCreate.length})
                    </p>
                    <label className="flex items-center gap-1.5 text-[11px] text-[#666] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allNewSelected}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedNew(new Set(preview.toCreate.map((p) => p.profileId)));
                          else setSelectedNew(new Set());
                        }}
                        className="accent-brand"
                      />
                      {allNewSelected ? 'Deselect all' : 'Select all'}
                    </label>
                  </div>
                  <div className="border border-white/[0.06] rounded-sm overflow-hidden">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-white/[0.02] border-b border-white/[0.06]">
                          <th className="w-8 px-3 py-2" />
                          <th className="text-left px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">Name</th>
                          <th className="text-left px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">DOB</th>
                          <th className="text-left px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">Grade</th>
                          <th className="text-left px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">Parent Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.toCreate.map((p) => (
                          <PlayerImportRow
                            key={p.profileId}
                            entry={p}
                            checked={selectedNew.has(p.profileId)}
                            onChange={(v) => toggleNew(p.profileId, v)}
                            variant="new"
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Duplicates */}
              {preview.duplicates.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-yellow-400">
                        Potential duplicates ({preview.duplicates.length})
                      </p>
                      <p className="text-[11px] text-[#666] mt-0.5">
                        These SE profiles match an existing player in this season by name/DOB.
                        Select to merge — this links the SE profile ID to the existing record and fills any blank fields.
                        Status, notes, and team assignment are preserved.
                      </p>
                    </div>
                  </div>
                  <div className="border border-yellow-400/20 rounded-sm overflow-hidden">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-yellow-400/[0.05] border-b border-yellow-400/10">
                          <th className="w-8 px-3 py-2" />
                          <th className="text-left px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">SE Profile</th>
                          <th className="text-left px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">DOB</th>
                          <th className="text-left px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">Grade</th>
                          <th className="text-left px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">Existing Status</th>
                          <th className="text-right px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.duplicates.map((d) => (
                          <DuplicateImportRow
                            key={d.profileId}
                            entry={d}
                            checked={selectedDups.has(d.profileId)}
                            onChange={(v) => toggleDup(d.profileId, v)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {preview.toCreate.length === 0 && preview.duplicates.length === 0 && (
                <p className="text-[13px] text-[#555] text-center py-4">
                  All profiles from this registration already exist in the selected season.
                </p>
              )}
            </>
          )}

          {/* ── Importing ── */}
          {stage === 'importing' && (
            <div className="flex items-center gap-2 text-[#888] text-[13px] py-4">
              <RefreshCw size={14} className="animate-spin" /> Importing players…
            </div>
          )}

          {/* ── Done ── */}
          {stage === 'done' && (
            <div className="flex items-center gap-2 text-green-400 text-[13px] py-4">
              <CheckCircle2 size={15} /> {doneMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0">
          {(stage === 'configure' || stage === 'error') && (
            <div className="flex gap-3">
              <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
              <Button
                variant="primary"
                onClick={runPreview}
                disabled={!seasonId || !registrationId.trim()}
                className="flex-1"
              >
                <Download size={13} /> Fetch &amp; Preview
              </Button>
            </div>
          )}
          {stage === 'fetching' && (
            <Button variant="ghost" onClick={onClose} className="w-full">Cancel</Button>
          )}
          {stage === 'preview' && preview && (
            preview.toCreate.length === 0 && preview.duplicates.length === 0 ? (
              <Button variant="outline" onClick={onClose} className="w-full">Close — Nothing to import</Button>
            ) : (
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setStage('configure')} className="flex-1">Back</Button>
                <Button
                  variant="primary"
                  onClick={runCommit}
                  disabled={totalSelected === 0}
                  className="flex-1"
                >
                  Import Selected ({totalSelected})
                </Button>
              </div>
            )
          )}
          {stage === 'importing' && (
            <Button variant="ghost" disabled className="w-full">Importing…</Button>
          )}
          {stage === 'done' && (
            <Button variant="primary" onClick={onClose} className="w-full">Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerImportRow({
  entry, checked, onChange, variant,
}: {
  entry: SEImportPlayerEntry;
  checked: boolean;
  onChange: (v: boolean) => void;
  variant: 'new';
}) {
  return (
    <tr className={cn('border-b border-white/[0.04] last:border-0', checked ? '' : 'opacity-50')}>
      <td className="px-3 py-2">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-brand" />
      </td>
      <td className="px-3 py-2 text-white">
        {entry.firstName} {entry.lastName}
        {variant === 'new' && (
          <span className="ml-1.5 text-[10px] font-bold text-green-400 uppercase tracking-wide">new</span>
        )}
      </td>
      <td className="px-3 py-2 text-[#888]">{fmtDob(entry.dateOfBirth)}</td>
      <td className="px-3 py-2 text-[#888]">{entry.grade ?? <span className="text-[#444]">—</span>}</td>
      <td className="px-3 py-2 text-[#666] truncate max-w-[180px]">{entry.parentEmail ?? <span className="text-[#444]">—</span>}</td>
    </tr>
  );
}

function DuplicateImportRow({
  entry, checked, onChange,
}: {
  entry: SEImportPlayerDuplicate;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <tr className={cn('border-b border-white/[0.04] last:border-0', checked ? '' : 'opacity-60')}>
      <td className="px-3 py-2">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-yellow-400" />
      </td>
      <td className="px-3 py-2 text-white">
        {entry.firstName} {entry.lastName}
      </td>
      <td className="px-3 py-2 text-[#888]">{fmtDob(entry.dateOfBirth)}</td>
      <td className="px-3 py-2 text-[#888]">{entry.grade ?? <span className="text-[#444]">—</span>}</td>
      <td className="px-3 py-2">
        <StatusBadge status={entry.existingStatus} />
      </td>
      <td className="px-3 py-2 text-right">
        {checked ? (
          <span className="text-[11px] text-yellow-400 flex items-center gap-1 justify-end">
            <GitMerge size={11} /> Merge
          </span>
        ) : (
          <span className="text-[11px] text-[#444]">Skip</span>
        )}
      </td>
    </tr>
  );
}

// ─── Player row in admin table ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color: Record<string, string> = {
    draft:      'text-[#888] bg-white/[0.06]',
    sent:       'text-[#E5A567] bg-[#E5A567]/10',
    accepted:   'text-green-400 bg-green-400/10',
    declined:   'text-[#E07070] bg-[#E07070]/10',
    expired:    'text-[#666] bg-white/[0.04]',
    waitlisted: 'text-[#6BAEFF] bg-[#6BAEFF]/10',
    rejected:   'text-[#E07070] bg-[#E07070]/10',
  };
  return (
    <span className={cn('text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded', color[status] ?? 'text-[#888]')}>
      {status}
    </span>
  );
}

interface AdminPlayerRowProps {
  player:   PlayerRow;
  seasons:  SeasonRow[];
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

function AdminPlayerRow({ player, seasons, selected, onToggle, onDelete }: AdminPlayerRowProps) {
  const seasonLabel = seasons.find((s) => s.id === player.seasonId)?.label ?? '—';
  return (
    <tr className={cn(
      'border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors',
      player.isDuplicate ? 'bg-yellow-400/[0.04]' : '',
    )}>
      <td className="px-3 py-2.5">
        <input type="checkbox" checked={selected} onChange={onToggle} className="accent-brand w-3.5 h-3.5" />
      </td>
      <td className="px-3 py-2.5 text-white text-[13px]">
        <div className="flex items-center gap-2 flex-wrap">
          {player.lastName}, {player.firstName}
          {/* Source badge */}
          {player.profileId
            ? (
              <span
                className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded bg-[#6BAEFF]/10 text-[#6BAEFF] border border-[#6BAEFF]/20"
                title={`SE Profile ID: ${player.profileId}`}
              >
                SE
              </span>
            )
            : player.importedFromSe
            ? (
              <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-400 border border-purple-400/20">
                Synced
              </span>
            )
            : (
              <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded bg-white/[0.06] text-[#666] border border-white/[0.08]">
                Manual
              </span>
            )
          }
          {/* Duplicate warning */}
          {player.isDuplicate && (
            <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
              Duplicate
            </span>
          )}
          {/* Profile ID hint */}
          {player.profileId && (
            <span className="text-[10px] font-mono text-[#444]">
              #{player.profileId.slice(-6)}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 text-[#888] text-[12px]">{seasonLabel}</td>
      <td className="px-3 py-2.5 text-[#888] text-[12px]">{fmtDob(player.dateOfBirth ?? null)}</td>
      <td className="px-3 py-2.5 text-[#888] text-[12px]">{player.grade ?? <span className="text-[#444]">—</span>}</td>
      <td className="px-3 py-2.5 text-[#666] text-[12px] max-w-[160px] truncate">{player.parentEmail}</td>
      <td className="px-3 py-2.5"><StatusBadge status={player.status} /></td>
      <td className="px-3 py-2.5 text-right">
        <button
          onClick={onDelete}
          className="p-1 text-[#555] hover:text-[#E07070] transition-colors"
          title="Delete player"
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function PlayersTab() {
  const [allSeasons,   setAllSeasons]   = useState<SeasonRow[]>([]);
  const [playerList,   setPlayerList]   = useState<PlayerRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [seasonFilter, setSeasonFilter] = useState('');
  const [search,       setSearch]       = useState('');
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [showImport,    setShowImport]    = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deletingAll,  setDeletingAll]  = useState(false);
  const [_deleting,    setDeleting]     = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ seasons }, { players }] = await Promise.all([
        seasonsApi.list(),
        playersAdminApi.list({
          seasonId: seasonFilter || undefined,
          search: search || undefined,
          perPage: '500',
        }),
      ]);
      seasons.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) || a.label.localeCompare(b.label));
      setAllSeasons(seasons);
      setPlayerList(players);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [seasonFilter, search]);

  useEffect(() => { load(); }, [load]);

  // Initialize seasonFilter to active season once seasons load
  useEffect(() => {
    if (!seasonFilter && allSeasons.length > 0) {
      const active = allSeasons.find((s) => s.isActive);
      if (active) setSeasonFilter(active.id);
    }
  }, [allSeasons, seasonFilter]);

  const filteredPlayers = playerList;
  const selectedSeason  = allSeasons.find((s) => s.id === seasonFilter);
  const duplicateCount  = filteredPlayers.filter((p) => p.isDuplicate).length;

  async function handleDeleteOne(playerId: string) {
    setDeleting((d) => new Set(d).add(playerId));
    try {
      await playersApi.delete(playerId);
      setPlayerList((prev) => prev.filter((p) => p.id !== playerId));
      setSelected((s) => { const n = new Set(s); n.delete(playerId); return n; });
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setDeleting((d) => { const n = new Set(d); n.delete(playerId); return n; });
    }
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    try {
      await Promise.all([...selected].map((id) => playersApi.delete(id)));
      setSelected(new Set());
      setShowBulkConfirm(false);
      await load();
    } catch (e: unknown) {
      setError((e as Error).message);
      setShowBulkConfirm(false);
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleDeleteAll() {
    if (!seasonFilter) return;
    setDeletingAll(true);
    try {
      await playersAdminApi.deleteBySeason(seasonFilter);
      setShowDeleteAll(false);
      setSelected(new Set());
      await load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setDeletingAll(false);
    }
  }

  const allSelected = filteredPlayers.length > 0 && filteredPlayers.every((p) => selected.has(p.id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filteredPlayers.map((p) => p.id)));
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-extrabold italic text-[22px] uppercase">Players</h2>
          <p className="text-[12px] text-[#666] mt-0.5">
            Admin view — import, manage, and bulk-operate on player profiles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button variant="danger" size="sm" onClick={() => setShowBulkConfirm(true)}>
              <Trash2 size={13} />Delete Selected ({selected.size})
            </Button>
          )}
          {seasonFilter && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteAll(true)}
              className="text-[#E07070] border-[#E07070]/30 hover:bg-[#E07070]/10"
            >
              <Trash2 size={13} />Delete All in Season
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowCsvImport(true)}>
            <Upload size={13} />Import from CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Download size={13} />Import from SE
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowAddPlayer(true)}>
            <Plus size={13} />Add Player
          </Button>
        </div>
      </div>

      {error && <p className="text-[13px] text-[#E07070]">{error}</p>}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Season filter */}
        <select
          value={seasonFilter}
          onChange={(e) => { setSeasonFilter(e.target.value); setSelected(new Set()); }}
          className="bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand min-w-[180px]"
        >
          <option value="">All seasons</option>
          {allSeasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}{s.isActive ? ' (active)' : ''}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-sm pl-9 pr-3 py-2 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-brand transition-colors"
            placeholder="Search players…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {search && (
          <button onClick={() => setSearch('')} className="text-[11px] text-[#555] hover:text-white transition-colors">
            <X size={12} className="inline mr-1" />Clear
          </button>
        )}

        <span className="ml-auto text-[11px] text-[#555]">
          {filteredPlayers.length} player{filteredPlayers.length !== 1 ? 's' : ''}
          {duplicateCount > 0 && (
            <span className="ml-2 text-yellow-400">{duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''}</span>
          )}
        </span>
      </div>

      {/* Duplicate notice */}
      {duplicateCount > 0 && (
        <div className="flex items-center gap-2 bg-yellow-400/[0.08] border border-yellow-400/20 rounded-sm px-4 py-3 text-[12px] text-yellow-300">
          <AlertTriangle size={14} className="shrink-0" />
          {duplicateCount} player{duplicateCount !== 1 ? 's' : ''} in this season share the same name and date of birth.
          Use "Import from SE" to merge them with their SE profile, or delete the duplicate manually.
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-[#555] text-sm py-8 text-center">Loading…</div>
      ) : filteredPlayers.length === 0 ? (
        <div className="text-[#555] text-sm text-center py-12">
          {search || seasonFilter
            ? 'No players match the current filters.'
            : 'No players yet. Import from SE or add manually.'}
        </div>
      ) : (
        <div className="border border-white/[0.08] rounded-sm overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/[0.06]">
                <th className="w-8 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="accent-brand w-3.5 h-3.5"
                  />
                </th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest uppercase text-[#555]">Name</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest uppercase text-[#555]">Season</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest uppercase text-[#555]">DOB</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest uppercase text-[#555]">Grade</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest uppercase text-[#555]">Parent Email</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest uppercase text-[#555]">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((p) => (
                <AdminPlayerRow
                  key={p.id}
                  player={p}
                  seasons={allSeasons}
                  selected={selected.has(p.id)}
                  onToggle={() => setSelected((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                  onDelete={() => handleDeleteOne(p.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCsvImport && (
        <CsvImportModal
          mode="players"
          seasonId={seasonFilter || undefined}
          onClose={() => setShowCsvImport(false)}
          onImported={() => { setShowCsvImport(false); load(); }}
        />
      )}

      {showImport && (
        <SEPlayerImportModal
          seasons={allSeasons}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(); }}
        />
      )}

      {showAddPlayer && (
        <AddPlayerModal
          open={showAddPlayer}
          onClose={() => setShowAddPlayer(false)}
          onCreated={() => { setShowAddPlayer(false); load(); }}
        />
      )}

      {showDeleteAll && selectedSeason && (
        <ConfirmDeleteSeasonModal
          seasonLabel={selectedSeason.label}
          count={filteredPlayers.filter((p) => p.seasonId === seasonFilter).length}
          onConfirm={handleDeleteAll}
          onClose={() => setShowDeleteAll(false)}
          loading={deletingAll}
        />
      )}

      {showBulkConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1A1A1A] border border-white/10 rounded-xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="font-display font-extrabold italic uppercase text-[18px] text-[#E07070]">
              Delete {selected.size} Player{selected.size !== 1 ? 's' : ''}
            </h3>
            <p className="text-[13px] text-[#888]">
              Permanently delete <strong className="text-white">{selected.size} player{selected.size !== 1 ? 's' : ''}</strong>?
              This also removes their offers and activity history. This cannot be undone.
            </p>
            <div className="flex gap-3 pt-1">
              <Button variant="ghost" onClick={() => setShowBulkConfirm(false)} disabled={bulkDeleting} className="flex-1">Cancel</Button>
              <Button
                variant="danger"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex-1 bg-[#E07070] hover:bg-[#C05050] border-transparent text-white"
              >
                {bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
