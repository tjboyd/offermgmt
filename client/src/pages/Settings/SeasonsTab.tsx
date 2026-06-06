import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, Wand2, Trash2, ArchiveIcon } from 'lucide-react';
import { seasonsApi, syncApi, type SeasonRow, type SyncLogRow } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { NewSeasonWizard } from './NewSeasonWizard';

// ─── Season Form ──────────────────────────────────────────────────────────────

interface SeasonFormProps {
  initial?: SeasonRow | null;
  onSave: (data: Partial<SeasonRow>) => Promise<void>;
  onClose: () => void;
}

function SeasonForm({ initial, onSave, onClose }: SeasonFormProps) {
  const [form, setForm] = useState({
    label:            initial?.label            ?? '',
    offerExpiresDays: initial?.offerExpiresDays ?? 14,
    tryoutStart:      initial?.tryoutStart      ?? '',
    tryoutEnd:        initial?.tryoutEnd        ?? '',
    seasonStartDate:  initial?.seasonStartDate  ?? '',
    registrationUrl:  initial?.registrationUrl  ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        label:            form.label,
        offerExpiresDays: form.offerExpiresDays,
        tryoutStart:      form.tryoutStart      || undefined,
        tryoutEnd:        form.tryoutEnd        || undefined,
        seasonStartDate:  form.seasonStartDate  || undefined,
        registrationUrl:  form.registrationUrl  || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to save.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1A1A1A] border border-white/[0.08] rounded-md w-full max-w-lg">
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <h2 className="font-display font-extrabold italic text-[22px] uppercase">
            {initial ? 'Edit Season' : 'New Season'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <Input
            label="Season Label"
            value={form.label}
            placeholder="e.g. 2027 Season"
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            required
          />
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888]">Offer Expires (days)</label>
              <input
                type="number"
                min={1}
                value={form.offerExpiresDays}
                onChange={(e) => setForm((f) => ({ ...f, offerExpiresDays: Number(e.target.value) }))}
                className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none focus:border-brand"
              />
            </div>
            <Input
              label="Tryout Start"
              type="date"
              value={form.tryoutStart}
              onChange={(e) => setForm((f) => ({ ...f, tryoutStart: e.target.value }))}
              className="flex-1"
            />
            <Input
              label="Tryout End"
              type="date"
              value={form.tryoutEnd}
              onChange={(e) => setForm((f) => ({ ...f, tryoutEnd: e.target.value }))}
              className="flex-1"
            />
          </div>

          <Input
            label="Season Start Date"
            type="date"
            value={form.seasonStartDate}
            onChange={(e) => setForm((f) => ({ ...f, seasonStartDate: e.target.value }))}
          />
          <p className="text-[11px] text-[#555] -mt-2">
            Used as the reference date for age eligibility calculations in divisions.
          </p>

          <Input
            label="Registration Form URL"
            type="url"
            value={form.registrationUrl}
            placeholder="https://register.example.com/2027"
            onChange={(e) => setForm((f) => ({ ...f, registrationUrl: e.target.value }))}
          />
          <p className="text-[11px] text-[#555] -mt-2">
            Link families are directed to after accepting their offer. Available as{' '}
            <span className="font-mono text-[#888]">{'{{registrationUrl}}'}</span> in email templates.
          </p>

          {error && <p className="text-[12px] text-[#E07070]">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Season'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Sync Log Row ─────────────────────────────────────────────────────────────

function SyncLogTable({ logs }: { logs: SyncLogRow[] }) {
  if (!logs.length) return <p className="text-[12px] text-[#555] italic">No syncs recorded for this season.</p>;
  return (
    <div className="border border-white/[0.06] rounded-sm overflow-hidden">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-white/[0.02] border-b border-white/[0.06]">
            <th className="text-left px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">When</th>
            <th className="text-right px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">Fetched</th>
            <th className="text-right px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">New</th>
            <th className="text-right px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">Updated</th>
            <th className="text-left px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#555]">Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-white/[0.04] last:border-0">
              <td className="px-3 py-2 text-[#888]">{new Date(l.triggeredAt).toLocaleString()}</td>
              <td className="px-3 py-2 text-right text-[#888]">{l.recordsFetched ?? '—'}</td>
              <td className="px-3 py-2 text-right text-green-400">{l.recordsNew ?? '—'}</td>
              <td className="px-3 py-2 text-right text-[#AAA]">{l.recordsUpdated ?? '—'}</td>
              <td className="px-3 py-2">
                {l.errorMessage
                  ? <span className="text-[#E07070]">{l.errorMessage}</span>
                  : <span className="text-green-400">OK</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Season Card ──────────────────────────────────────────────────────────────

interface SeasonCardProps {
  season:     SeasonRow;
  onEdit:     () => void;
  onActivate: () => void;
  onArchive:  () => void;
  onDelete:   () => void;
}

function SeasonCard({ season, onEdit, onActivate, onArchive, onDelete }: SeasonCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [logs,     setLogs]     = useState<SyncLogRow[] | null>(null);
  const [syncing,  setSyncing]  = useState(false);
  const [syncMsg,  setSyncMsg]  = useState<string | null>(null);

  async function loadLogs() {
    try {
      const { logs: l } = await seasonsApi.syncLog(season.id);
      setLogs(l);
    } catch {}
  }

  async function expand(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !expanded;
    setExpanded(next);
    if (next && logs === null) await loadLogs();
  }

  async function runSync(e: React.MouseEvent) {
    e.stopPropagation();
    setSyncing(true);
    setSyncMsg(null);
    try {
      const { result } = await syncApi.tryouts(season.id);
      setSyncMsg(`Sync complete — ${result.recordsNew} new, ${result.recordsUpdated} updated.`);
      await loadLogs();
    } catch (err: unknown) {
      setSyncMsg((err as Error).message ?? 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className={cn(
      'border rounded-sm overflow-hidden',
      season.isActive ? 'border-brand/40' : 'border-white/[0.08]',
    )}>
      {/* Clickable row — opens edit modal */}
      <div
        className="flex items-center px-4 py-3 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-colors"
        onClick={onEdit}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold italic text-[15px] uppercase text-white">{season.label}</span>
            {season.isActive && (
              <span className="flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-brand">
                <CheckCircle2 size={11} />Active
              </span>
            )}
            {season.isArchived && (
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#555]">Archived</span>
            )}
          </div>
          <div className="text-[11px] text-[#555] mt-0.5 space-x-3">
            {season.tryoutStart && <span>Tryouts: {season.tryoutStart} – {season.tryoutEnd ?? '?'}</span>}
            <span>Offer expires: {season.offerExpiresDays}d</span>
          </div>
        </div>

        {/* Actions — stop propagation so row click doesn't fire when clicking buttons */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {!season.isActive && !season.isArchived && (
            <Button variant="outline" size="sm" onClick={onActivate}>Set Active</Button>
          )}
          {!season.isArchived && !season.isActive && (
            <button
              onClick={onArchive}
              className="p-1.5 text-[#555] hover:text-yellow-400 transition-colors"
              title="Archive season"
            >
              <ArchiveIcon size={13} />
            </button>
          )}
          {season.isArchived && (
            <button
              onClick={onActivate}
              className="p-1.5 text-[#555] hover:text-green-400 transition-colors"
              title="Unarchive season"
            >
              <CheckCircle2 size={13} />
            </button>
          )}
          {!season.isActive && (
            <button
              onClick={onDelete}
              className="p-1.5 text-[#555] hover:text-[#E07070] transition-colors"
              title="Delete season"
            >
              <Trash2 size={13} />
            </button>
          )}
          <Button variant="ghost" size="sm" onClick={runSync} disabled={syncing}>
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync'}
          </Button>
          <button onClick={expand} className="p-1.5 text-[#555] hover:text-white transition-colors">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className="px-4 py-2 bg-white/[0.02] border-t border-white/[0.04] text-[12px] text-[#AAA]">{syncMsg}</div>
      )}

      {expanded && (
        <div className="px-4 py-4 border-t border-white/[0.06] space-y-3">
          <div>
            <div className="text-[10px] font-bold tracking-widest uppercase text-[#555] mb-2">Sync Log</div>
            {logs === null ? <div className="text-[#555] text-[12px]">Loading…</div> : <SyncLogTable logs={logs} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function SeasonsTab() {
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [modal,   setModal]   = useState<
    | { type: 'new' }
    | { type: 'edit'; season: SeasonRow }
    | { type: 'delete'; season: SeasonRow }
    | { type: 'wizard' }
    | null
  >(null);
  const [deleting,  setDeleting]  = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { seasons: s } = await seasonsApi.list();
      // active first, then by label
      s.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) || a.label.localeCompare(b.label));
      setSeasons(s);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(data: Partial<SeasonRow>) {
    await seasonsApi.create(data);
    await load();
  }

  async function handleUpdate(id: string, data: Partial<SeasonRow>) {
    await seasonsApi.update(id, data);
    await load();
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    setDeleteErr(null);
    try {
      await seasonsApi.delete(id);
      setModal(null);
      await load();
    } catch (err: unknown) {
      setDeleteErr((err as Error).message ?? 'Failed to delete.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-extrabold italic text-[22px] uppercase">Seasons</h2>
          <p className="text-[12px] text-[#666] mt-0.5">Configure tryout seasons, registration URLs, and sync settings.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setModal({ type: 'new' })}>
            <Plus size={13} />Quick Add
          </Button>
          <Button variant="primary" size="sm" onClick={() => setModal({ type: 'wizard' })}>
            <Wand2 size={13} />New Season Wizard
          </Button>
        </div>
      </div>

      {error && <p className="text-[13px] text-[#E07070]">{error}</p>}

      {loading ? (
        <div className="text-[#555] text-sm">Loading…</div>
      ) : (
        <div className="space-y-3">
          {seasons.map((s) => (
            <SeasonCard
              key={s.id}
              season={s}
              onEdit={()      => setModal({ type: 'edit', season: s })}
              onActivate={async () => { await seasonsApi.activate(s.id); await load(); }}
              onArchive={async ()  => { await seasonsApi.archive(s.id);  await load(); }}
              onDelete={()    => { setDeleteErr(null); setModal({ type: 'delete', season: s }); }}
            />
          ))}
          {seasons.length === 0 && (
            <div className="text-[#555] text-sm text-center py-8">No seasons configured yet.</div>
          )}
        </div>
      )}

      {modal?.type === 'new' && (
        <SeasonForm onSave={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'edit' && (
        <SeasonForm
          initial={modal.season}
          onSave={(data) => handleUpdate(modal.season.id, data)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'wizard' && (
        <NewSeasonWizard
          onComplete={async () => { setModal(null); await load(); }}
          onClose={() => setModal(null)}
        />
      )}

      {/* Delete confirmation */}
      {modal?.type === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-[#1A1A1A] border border-white/[0.08] rounded-md w-full max-w-sm p-6 space-y-4">
            <h2 className="font-display font-extrabold italic text-[20px] uppercase text-white">Delete Season</h2>
            <p className="text-[13px] text-[#888]">
              Permanently delete <span className="text-white font-semibold">{modal.season.label}</span>?
              This will also remove its email templates and sync log.
              Teams linked to this season will be unlinked.
            </p>
            <p className="text-[12px] text-[#E07070]">
              This cannot be undone. If the season has players, archive it instead.
            </p>
            {deleteErr && <p className="text-[12px] text-[#E07070]">{deleteErr}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={() => setModal(null)} disabled={deleting}>Cancel</Button>
              <Button variant="danger" onClick={() => handleDelete(modal.season.id)} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Season'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
