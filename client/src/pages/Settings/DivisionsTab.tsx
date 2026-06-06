import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Users, Check, Hash, GraduationCap, Shuffle } from 'lucide-react';
import type { EligibilityMode, AgeConstraint, GradeConstraint } from '@/lib/api';
import {
  divisionsApi, seasonsApi, teamsApi, configApi,
  type DivisionRow, type SeasonRow, type TeamRow,
} from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageRangeLabel(div: DivisionRow): string {
  if (div.minAgeYears != null && div.maxAgeYears != null) {
    return `Ages ${div.minAgeYears}–${div.maxAgeYears}`;
  }
  if (div.minAgeYears != null) return `Age ${div.minAgeYears}+`;
  if (div.maxAgeYears != null) return `Up to age ${div.maxAgeYears}`;
  return '';
}

// ─── Grade checkbox picker ────────────────────────────────────────────────────

function GradesCheckboxes({
  value,
  onChange,
  configuredGrades,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  configuredGrades: string[];
}) {
  function toggle(g: string) {
    onChange(value.includes(g) ? value.filter((v) => v !== g) : [...value, g]);
  }

  if (configuredGrades.length === 0) {
    return (
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#888]">
          Allowed Grades
        </label>
        <p className="text-[12px] text-[#555]">
          No grade values configured yet.{' '}
          <a href="/settings/organization" className="text-brand hover:underline">
            Set them up in Organization settings
          </a>{' '}
          to enable grade-based eligibility rules.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#888]">
          Allowed Grades
        </label>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-[#555] hover:text-white transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {configuredGrades.map((g) => {
          const checked = value.includes(g);
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggle(g)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-[13px] font-medium transition-colors ${
                checked
                  ? 'bg-brand/15 border-brand/50 text-white'
                  : 'bg-[#1A1A1A] border-white/[0.08] text-[#888] hover:border-white/20 hover:text-white'
              }`}
            >
              {checked && <Check size={11} className="text-brand" />}
              {g}
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <p className="text-[11px] text-[#555]">
          {value.length} of {configuredGrades.length} grade{configuredGrades.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}

// ─── Division Form (inline panel) ────────────────────────────────────────────

interface DivisionFormProps {
  seasonId: string;
  initial?: DivisionRow | null;
  onSave: () => void;
  onCancel: () => void;
}

const MODE_OPTIONS: { value: EligibilityMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'none',
    label: 'None',
    description: 'No eligibility rules. No warnings will be shown for this division.',
    icon: <span className="text-[13px]">—</span>,
  },
  {
    value: 'age',
    label: 'Age only',
    description: 'Player must be within the age range as of the season start date.',
    icon: <Hash size={14} />,
  },
  {
    value: 'grade',
    label: 'Grade only',
    description: 'Player must be enrolled in one of the allowed grades.',
    icon: <GraduationCap size={14} />,
  },
  {
    value: 'either',
    label: 'Grade OR Age',
    description: 'Player qualifies if they meet the grade requirement OR the age requirement — not both required.',
    icon: <Shuffle size={14} />,
  },
];

function DivisionForm({ seasonId, initial, onSave, onCancel }: DivisionFormProps) {
  const [name,              setName]              = useState(initial?.name             ?? '');
  const [mode,              setMode]              = useState<EligibilityMode>(initial?.eligibilityMode ?? 'none');
  const [ageConstraint,     setAgeConstraint]     = useState<AgeConstraint>(initial?.ageConstraint   ?? 'max_only');
  const [minAgeYears,       setMinAgeYears]       = useState<string>(initial?.minAgeYears != null ? String(initial.minAgeYears) : '');
  const [maxAgeYears,       setMaxAgeYears]       = useState<string>(initial?.maxAgeYears != null ? String(initial.maxAgeYears) : '');
  const [gradeConstraint,   setGradeConstraint]   = useState<GradeConstraint>(initial?.gradeConstraint ?? 'exact');
  const [grades,            setGrades]            = useState<string[]>(initial?.allowedGrades ?? []);
  const [configuredGrades,  setConfiguredGrades]  = useState<string[]>([]);
  const [saving,            setSaving]            = useState(false);
  const [error,             setError]             = useState<string | null>(null);

  const showAge   = mode === 'age'   || mode === 'either';
  const showGrade = mode === 'grade' || mode === 'either';

  useEffect(() => {
    configApi.get().then((r) => {
      const raw = r.config['gradeValues'];
      let parsed: string[] = [];
      if (Array.isArray(raw)) parsed = raw as string[];
      else if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) parsed = p; } catch { /* ignore */ } }
      setConfiguredGrades(parsed);
    }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = {
        seasonId,
        name,
        eligibilityMode: mode,
        ageConstraint:   showAge   ? ageConstraint   : 'max_only' as AgeConstraint,
        minAgeYears:     showAge   && ageConstraint === 'range' && minAgeYears ? Number(minAgeYears) : null,
        maxAgeYears:     showAge   && maxAgeYears ? Number(maxAgeYears) : null,
        gradeConstraint: showGrade ? gradeConstraint : 'exact' as GradeConstraint,
        allowedGrades:   showGrade && grades.length > 0 ? grades : null,
      };
      if (initial) {
        await divisionsApi.update(initial.id, data);
      } else {
        await divisionsApi.create(data);
      }
      onSave();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to save.');
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white/[0.03] border border-white/[0.08] rounded-sm px-4 py-4 space-y-4"
    >
      <div className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#555]">
        {initial ? 'Edit Division' : 'New Division'}
      </div>

      <Input
        label="Division Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. 10U, Majors, Junior Varsity"
        required
      />

      {/* Eligibility mode toggle */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#888]">
          Eligibility Based On
        </label>
        <div className="grid grid-cols-4 gap-2">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-sm border text-center transition-colors ${
                mode === opt.value
                  ? 'bg-brand/15 border-brand/50 text-white'
                  : 'bg-[#1A1A1A] border-white/[0.08] text-[#888] hover:border-white/20 hover:text-white'
              }`}
            >
              <span className={mode === opt.value ? 'text-brand' : ''}>{opt.icon}</span>
              <span className="text-[11px] font-semibold leading-tight">{opt.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[#555] leading-snug">
          {MODE_OPTIONS.find((o) => o.value === mode)?.description}
        </p>
      </div>

      {/* Age fields — shown for 'age' and 'either' */}
      {showAge && (
        <div className="space-y-3 pl-3 border-l-2 border-white/[0.06]">
          <label className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#888]">
            Age Eligibility
          </label>

          {/* Age constraint toggle */}
          <div className="flex gap-2">
            {([
              { value: 'max_only', label: 'Not to exceed', desc: 'Max age only — younger players may play up' },
              { value: 'range',    label: 'Strict range',  desc: 'Must be within exact min–max window (no playing up or down)' },
            ] as { value: AgeConstraint; label: string; desc: string }[]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAgeConstraint(opt.value)}
                className={`flex-1 px-3 py-2 rounded-sm border text-[12px] font-semibold transition-colors ${
                  ageConstraint === opt.value
                    ? 'bg-brand/15 border-brand/50 text-white'
                    : 'bg-[#1A1A1A] border-white/[0.08] text-[#888] hover:border-white/20 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#555]">
            {ageConstraint === 'max_only'
              ? 'Only the max age is enforced. Players younger than the max are always eligible.'
              : 'Both min and max ages are enforced. Players outside the range are ineligible.'}
          </p>

          <div className="flex gap-3">
            {ageConstraint === 'range' && (
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-[10px] text-[#555] uppercase tracking-widest">Min age</span>
                <input
                  type="number" min={0} max={25} value={minAgeYears}
                  onChange={(e) => setMinAgeYears(e.target.value)}
                  placeholder="—"
                  className="bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand transition-colors"
                />
              </div>
            )}
            <div className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] text-[#555] uppercase tracking-widest">Max age</span>
              <input
                type="number" min={0} max={25} value={maxAgeYears}
                onChange={(e) => setMaxAgeYears(e.target.value)}
                placeholder="—"
                className="bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand transition-colors"
              />
            </div>
          </div>
        </div>
      )}

      {/* Grade fields — shown for 'grade' and 'either' */}
      {showGrade && (
        <div className="space-y-3 pl-3 border-l-2 border-white/[0.06]">
          <label className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#888]">
            Grade Eligibility
          </label>

          {/* Grade constraint toggle */}
          <div className="flex gap-2">
            {([
              { value: 'not_exceed', label: 'Not to exceed', desc: 'Younger grades may play up into this division' },
              { value: 'exact',      label: 'Strict (exact)', desc: 'Player must be in exactly one of the selected grades — no playing up' },
            ] as { value: GradeConstraint; label: string; desc: string }[]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGradeConstraint(opt.value)}
                className={`flex-1 px-3 py-2 rounded-sm border text-[12px] font-semibold transition-colors ${
                  gradeConstraint === opt.value
                    ? 'bg-brand/15 border-brand/50 text-white'
                    : 'bg-[#1A1A1A] border-white/[0.08] text-[#888] hover:border-white/20 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#555]">
            {gradeConstraint === 'not_exceed'
              ? 'Select the highest allowed grade. Players in that grade or any lower grade are eligible.'
              : 'Select all eligible grades. Players not in exactly one of these grades are ineligible.'}
          </p>

          <GradesCheckboxes value={grades} onChange={setGrades} configuredGrades={configuredGrades} />
        </div>
      )}

      {error && <p className="text-[12px] text-[#E07070]">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Division'}
        </Button>
      </div>
    </form>
  );
}

// ─── Team assignment selector ─────────────────────────────────────────────────

interface TeamAssignmentProps {
  divisionId: string;
  seasonId: string;
  allSeasonTeams: TeamRow[];
  divisionTeams: TeamRow[];
  onChanged: () => void;
}

function TeamAssignment({ divisionId, seasonId: _seasonId, allSeasonTeams, divisionTeams, onChanged }: TeamAssignmentProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);

  const assignedIds = new Set(divisionTeams.map((t) => t.id));

  async function assign(teamId: string) {
    setSaving(teamId);
    setError(null);
    try {
      await teamsApi.update(teamId, { divisionId } as Parameters<typeof teamsApi.update>[1]);
      onChanged();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to assign.');
    } finally {
      setSaving(null);
    }
  }

  async function unassign(teamId: string) {
    setSaving(teamId);
    setError(null);
    try {
      await teamsApi.update(teamId, { divisionId: null } as Parameters<typeof teamsApi.update>[1]);
      onChanged();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to unassign.');
    } finally {
      setSaving(null);
    }
  }

  if (allSeasonTeams.length === 0) {
    return <p className="text-[12px] text-[#555] italic">No teams linked to this season.</p>;
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#555] mb-2">Teams</div>
      {allSeasonTeams.map((team) => {
        const isAssigned = assignedIds.has(team.id);
        const isLoading  = saving === team.id;
        return (
          <div key={team.id} className="flex items-center justify-between gap-3 py-1">
            <span className="text-[13px] text-[#CCC] flex-1">{team.name}</span>
            <button
              onClick={() => isAssigned ? unassign(team.id) : assign(team.id)}
              disabled={isLoading}
              className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded transition-colors ${
                isAssigned
                  ? 'bg-brand/20 text-brand hover:bg-brand/30'
                  : 'bg-white/[0.06] text-[#777] hover:bg-white/[0.1] hover:text-white'
              }`}
            >
              {isLoading ? (
                '…'
              ) : isAssigned ? (
                <><Check size={11} />Assigned</>
              ) : (
                <><Plus size={11} />Assign</>
              )}
            </button>
          </div>
        );
      })}
      {error && <p className="text-[12px] text-[#E07070] mt-1">{error}</p>}
    </div>
  );
}

// ─── Division Card ────────────────────────────────────────────────────────────

interface DivisionCardProps {
  division:       DivisionRow;
  allSeasonTeams: TeamRow[];
  onEdit:         () => void;
  onDelete:       () => void;
  onTeamsChanged: () => void;
}

function DivisionCard({ division, allSeasonTeams, onEdit, onDelete, onTeamsChanged }: DivisionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const divisionTeams = allSeasonTeams.filter((t) => t.divisionId === division.id);
  const ageLabel = ageRangeLabel(division);

  return (
    <div className="border border-white/[0.08] rounded-sm overflow-hidden">
      <div className="flex items-center px-4 py-3 bg-white/[0.02]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold italic text-[15px] uppercase text-white">{division.name}</span>
            {/* Mode badge */}
            {division.eligibilityMode === 'none' && (
              <span className="text-[10px] tracking-widest uppercase px-1.5 py-0.5 rounded border border-white/[0.06] text-[#444]">No eligibility</span>
            )}
            {division.eligibilityMode === 'age' && (
              <span className="text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded border border-white/[0.08] text-[#888]">Age</span>
            )}
            {division.eligibilityMode === 'grade' && (
              <span className="text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded border border-white/[0.08] text-[#888]">Grade</span>
            )}
            {division.eligibilityMode === 'either' && (
              <span className="text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded bg-brand/10 border border-brand/20 text-[#E07070]">Grade OR Age</span>
            )}
            {ageLabel && (division.eligibilityMode === 'age' || division.eligibilityMode === 'either') && (
              <span className="text-[11px] text-[#555] border border-white/[0.06] rounded px-1.5 py-0.5">{ageLabel}</span>
            )}
            {division.allowedGrades && division.allowedGrades.length > 0 && (division.eligibilityMode === 'grade' || division.eligibilityMode === 'either') && (
              <span className="text-[11px] text-[#555]">
                Grades: {division.allowedGrades.join(', ')}
              </span>
            )}
            {!division.isActive && (
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#555]">Inactive</span>
            )}
          </div>
          <div className="text-[11px] text-[#555] mt-0.5">
            <span className="flex items-center gap-1">
              <Users size={11} />
              {divisionTeams.length} team{divisionTeams.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 text-[#555] hover:text-white transition-colors"
            title="Edit division"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-[#555] hover:text-[#E07070] transition-colors"
            title="Delete division"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => setExpanded((o) => !o)}
            className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-[#555] hover:text-white transition-colors"
          >
            <Users size={13} />
            {expanded ? 'Hide' : 'Teams'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <TeamAssignment
            divisionId={division.id}
            seasonId={division.seasonId}
            allSeasonTeams={allSeasonTeams}
            divisionTeams={divisionTeams}
            onChanged={onTeamsChanged}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function DivisionsTab() {
  const [seasons,    setSeasons]    = useState<SeasonRow[]>([]);
  const [seasonId,   setSeasonId]   = useState<string>('');
  const [divisions,  setDivisions]  = useState<DivisionRow[]>([]);
  const [teams,      setTeams]      = useState<TeamRow[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [editDiv,    setEditDiv]    = useState<DivisionRow | null>(null);
  const [deleteDiv,  setDeleteDiv]  = useState<DivisionRow | null>(null);
  const [deleting,   setDeleting]   = useState(false);
  const [deleteErr,  setDeleteErr]  = useState<string | null>(null);

  // Load seasons once
  useEffect(() => {
    seasonsApi.list().then((r) => {
      const active = r.seasons.filter((s) => !s.isArchived);
      active.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) || a.label.localeCompare(b.label));
      setSeasons(active);
      const defaultSeason = active.find((s) => s.isActive) ?? active[0];
      if (defaultSeason) setSeasonId(defaultSeason.id);
    }).catch(() => {});
  }, []);

  const loadDivisionsAndTeams = useCallback(async (sid: string) => {
    if (!sid) return;
    setLoading(true);
    setError(null);
    try {
      const [dRes, tRes] = await Promise.all([
        divisionsApi.listBySeason(sid),
        teamsApi.list(),
      ]);
      setDivisions(dRes.divisions);
      // Filter to teams belonging to this season
      setTeams(tRes.teams.filter((t) => t.seasonId === sid && t.isActive));
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (seasonId) loadDivisionsAndTeams(seasonId);
  }, [seasonId, loadDivisionsAndTeams]);

  async function handleDelete() {
    if (!deleteDiv) return;
    setDeleting(true);
    setDeleteErr(null);
    try {
      await divisionsApi.delete(deleteDiv.id);
      setDeleteDiv(null);
      await loadDivisionsAndTeams(seasonId);
    } catch (err: unknown) {
      setDeleteErr((err as Error).message ?? 'Failed to delete.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-extrabold italic text-[22px] uppercase">Divisions</h2>
          <p className="text-[12px] text-[#666] mt-0.5">
            Manage age-group divisions per season and assign teams.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { setShowAdd(true); setEditDiv(null); }}
          disabled={!seasonId}
        >
          <Plus size={13} />New Division
        </Button>
      </div>

      {/* Season selector */}
      <div className="flex items-center gap-3">
        <label className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#888] shrink-0">Season</label>
        <select
          value={seasonId}
          onChange={(e) => { setSeasonId(e.target.value); setShowAdd(false); setEditDiv(null); }}
          className="bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-[13px] text-white outline-none focus:border-brand min-w-[200px]"
        >
          <option value="">— Select a season —</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}{s.isActive ? ' (active)' : ''}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-[13px] text-[#E07070]">{error}</p>}

      {/* Add form */}
      {showAdd && !editDiv && seasonId && (
        <DivisionForm
          seasonId={seasonId}
          onSave={async () => { setShowAdd(false); await loadDivisionsAndTeams(seasonId); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* List */}
      {!seasonId ? (
        <div className="text-[#555] text-sm text-center py-10">Select a season to manage divisions.</div>
      ) : loading ? (
        <div className="text-[#555] text-sm">Loading…</div>
      ) : (
        <div className="space-y-3">
          {divisions.map((div) => (
            editDiv?.id === div.id ? (
              <DivisionForm
                key={div.id}
                seasonId={seasonId}
                initial={div}
                onSave={async () => { setEditDiv(null); await loadDivisionsAndTeams(seasonId); }}
                onCancel={() => setEditDiv(null)}
              />
            ) : (
              <DivisionCard
                key={div.id}
                division={div}
                allSeasonTeams={teams}
                onEdit={() => { setEditDiv(div); setShowAdd(false); }}
                onDelete={() => { setDeleteErr(null); setDeleteDiv(div); }}
                onTeamsChanged={() => loadDivisionsAndTeams(seasonId)}
              />
            )
          ))}
          {divisions.length === 0 && (
            <div className="text-[#555] text-sm text-center py-10">
              No divisions yet for this season.
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteDiv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-[#1A1A1A] border border-white/[0.08] rounded-md w-full max-w-sm p-6 space-y-4">
            <h2 className="font-display font-extrabold italic text-[20px] uppercase text-white">Delete Division</h2>
            <p className="text-[13px] text-[#888]">
              Permanently delete <span className="text-white font-semibold">{deleteDiv.name}</span>?
              Teams assigned to this division will be unlinked. This cannot be undone.
            </p>
            {deleteErr && <p className="text-[12px] text-[#E07070]">{deleteErr}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={() => setDeleteDiv(null)} disabled={deleting}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Division'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
