import { useState, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, RefreshCw, AlertTriangle,
  CheckCircle2, Terminal, Search,
} from 'lucide-react';
import { seExplorerApi, type SEExplorerResult } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

// ─── JSON tree viewer ─────────────────────────────────────────────────────────

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);

  if (value === null) return <span className="text-[#888]">null</span>;
  if (typeof value === 'boolean') return <span className="text-[#6BAEFF]">{String(value)}</span>;
  if (typeof value === 'number') return <span className="text-[#E5A567]">{value}</span>;
  if (typeof value === 'string') {
    return <span className="text-green-400 break-all">"{value}"</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-[#888]">[]</span>;
    return (
      <span>
        <button onClick={() => setOpen((o) => !o)} className="text-[#888] hover:text-white transition-colors">
          {open ? <ChevronDown size={11} className="inline" /> : <ChevronRight size={11} className="inline" />}
          <span className="ml-0.5 text-[#888]">[{value.length}]</span>
        </button>
        {open && (
          <div className="ml-4 border-l border-white/[0.06] pl-3 mt-0.5 space-y-0.5">
            {value.map((item, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="text-[#555] shrink-0">{i}:</span>
                <JsonNode value={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-[#888]">{'{}'}</span>;
    return (
      <span>
        <button onClick={() => setOpen((o) => !o)} className="text-[#888] hover:text-white transition-colors">
          {open ? <ChevronDown size={11} className="inline" /> : <ChevronRight size={11} className="inline" />}
          <span className="ml-0.5 text-[#888]">{'{…}'}</span>
        </button>
        {open && (
          <div className="ml-4 border-l border-white/[0.06] pl-3 mt-0.5 space-y-0.5">
            {entries.map(([k, v]) => (
              <div key={k} className="flex gap-1.5 flex-wrap">
                <span className="text-brand/90 shrink-0">{k}:</span>
                <JsonNode value={v} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return <span className="text-[#CCC]">{String(value)}</span>;
}

// ─── Response pane ────────────────────────────────────────────────────────────

function ResponsePane({ result, loading }: { result: SEExplorerResult | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#555] gap-2">
        <RefreshCw size={14} className="animate-spin" />
        <span className="text-[13px]">Fetching from SportsEngine…</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#444] gap-2">
        <Terminal size={24} />
        <span className="text-[13px]">Select an endpoint and click Fetch</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-2">
          {result.ok
            ? <CheckCircle2 size={13} className="text-green-400" />
            : <AlertTriangle size={13} className="text-[#E07070]" />}
          <span className={cn('text-[12px] font-bold', result.ok ? 'text-green-400' : 'text-[#E07070]')}>
            {result.ok ? 'OK' : result.code ?? 'Error'}
          </span>
          {result.path && <span className="text-[11px] text-[#555] font-mono">{result.path}</span>}
        </div>
        <span className="text-[11px] text-[#555]">
          {result.fetchedAt ? new Date(result.fetchedAt).toLocaleTimeString() : ''}
        </span>
      </div>

      {/* Note banner (PII warning, sample note, etc.) */}
      {result.note && (
        <div className="px-4 py-2 bg-brand/[0.06] border-b border-brand/20 text-[11px] text-brand/80 shrink-0">
          ⚠ {result.note}
        </div>
      )}

      {/* Error details */}
      {!result.ok && (
        <div className="px-4 py-3 space-y-2 shrink-0 border-b border-white/[0.04]">
          {result.error && (
            <p className="text-[13px] text-[#E07070]">{result.error}</p>
          )}
          {result.hint && (
            <p className="text-[12px] text-[#E5A567]">💡 {result.hint}</p>
          )}
          {result.sentQuery && (
            <details className="text-[11px]">
              <summary className="cursor-pointer text-[#555] hover:text-[#888]">Query that was sent</summary>
              <pre className="mt-1.5 bg-[#111] rounded p-2 overflow-x-auto text-[#888] text-[10px]">
                {result.sentQuery}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* JSON tree */}
      <div className="flex-1 overflow-y-auto px-4 py-3 text-[12px] font-mono leading-relaxed">
        {result.ok && (
          <JsonNode value={result.orgData ?? result.data ?? result} depth={0} />
        )}
      </div>
    </div>
  );
}

// ─── Preset panels ────────────────────────────────────────────────────────────

interface Preset {
  id:    string;
  label: string;
  group: string;
  description: string;
  fetch: (input: string) => Promise<SEExplorerResult>;
  needsInput?: string; // placeholder for optional text input
}

const PRESETS: Preset[] = [
  // ── Connection ──
  {
    id: 'status', group: 'Connection', label: 'Connection Status',
    description: 'Live token validation via /oauth/me — confirms credentials are working.',
    fetch: () => seExplorerApi.status(),
  },
  // ── Schema Discovery (start here if presets return 400s) ──
  {
    id: 'schema-root', group: 'Schema Discovery', label: 'Root Query Fields',
    description: 'All entry-point fields available in the SE API. Start here — use these names to build correct queries.',
    fetch: () => seExplorerApi.schemaRootFields(),
  },
  {
    id: 'schema-types', group: 'Schema Discovery', label: 'All Types',
    description: 'Every GraphQL type in the SE schema — filter to OBJECT types to see queryable entities.',
    fetch: () => seExplorerApi.schemaTypes(),
  },
  {
    id: 'schema-type', group: 'Schema Discovery', label: 'Type Fields',
    description: 'All fields on a specific type — enter the type name exactly as returned by "All Types".',
    fetch: (input) => seExplorerApi.schemaType(input),
    needsInput: 'Type name e.g. Organization (required)',
  },
  // ── Data Presets (field names are guesses — fix using Schema Discovery above) ──
  {
    id: 'organization', group: 'Data Presets', label: 'Organization Info',
    description: 'Queries organization(id: Int!) using the stored Org ID. Set the Org ID in the SportsEngine credentials card above.',
    fetch: () => seExplorerApi.organization(),
  },
  {
    id: 'all-teams', group: 'Data Presets', label: 'All Teams',
    description: 'teams(organizationId, perPage: 100, page: 1) — exact query from SE docs. Returns id, name, gender, type, sport, status, rosterStatus, program (season/division).',
    fetch: () => seExplorerApi.allTeams(),
  },
  {
    id: 'seasons', group: 'Data Presets', label: 'Seasons (via Teams)',
    description: 'SE has no standalone seasons API — seasons are program.primaryName on each team. Same query as All Teams.',
    fetch: () => seExplorerApi.seasons(),
  },
  {
    id: 'season-detail', group: 'Data Presets', label: 'Team Detail',
    description: 'Single team by UUID — includes program (season name), players, staff, rosterStatus.',
    fetch: (input) => seExplorerApi.season(input),
    needsInput: 'Team UUID (required)',
  },
  {
    id: 'form-schema', group: 'Data Presets', label: 'Form Field Schema',
    description: 'Field definitions for a registration form. No member data.',
    fetch: (input) => seExplorerApi.formSchema(input),
    needsInput: 'Form ID (required)',
  },
  {
    id: 'form-sample', group: 'Data Presets', label: 'Form Sample (PII Stripped)',
    description: '2 registrant records, all personal fields redacted. Shows data structure only.',
    fetch: (input) => seExplorerApi.formSample(input),
    needsInput: 'Form ID (required)',
  },
  // ── Player Profiles ──
  {
    id: 'registration-profiles', group: 'Player Profiles', label: 'Profiles by Registration',
    description: 'Lists all profiles who submitted a specific registration form. Names are PII-redacted; use the count to confirm the registration ID is correct. This is the same registration ID used in Settings → Players → Import from SE.',
    fetch: (input) => seExplorerApi.registrationProfiles(input),
    needsInput: 'Registration Form ID (required)',
  },
  {
    id: 'profile-detail', group: 'Player Profiles', label: 'Profile by ID',
    description: 'Fetch a single SE profile. Confirmed fields: id, firstName, lastName, dateOfBirth, email, gender, address, phoneNumber. For minor athletes, email is typically the parent/guardian\'s email. Note: grade is not a Profile field.',
    fetch: (input) => seExplorerApi.profileDetail(input),
    needsInput: 'Profile ID (numeric, required)',
  },
];

// ─── Main panel ───────────────────────────────────────────────────────────────

export function SEExplorerPanel() {
  const [activeId,    setActiveId]    = useState<string>('status');
  const [input,       setInput]       = useState('');
  const [gqlQuery,    setGqlQuery]    = useState(
    '# SE confirmed field names so far:\n'
    + '#   organization(id: Int!)  — replace 12345 with your SE org ID\n'
    + '#   teams(first: N)         — to be confirmed\n'
    + '#   registrations(first: N) — to be confirmed\n\n'
    + 'query {\n  organization(id: 12345) {\n    id\n    name\n  }\n}',
  );
  const [result,      setResult]      = useState<SEExplorerResult | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [, setLastPreset]  = useState<Preset | null>(null);

  const activePreset = PRESETS.find((p) => p.id === activeId);

  const runFetch = useCallback(async (preset: Preset | null, overrideInput?: string) => {
    setLoading(true);
    setResult(null);
    try {
      let data: SEExplorerResult;
      if (preset) {
        data = await preset.fetch(overrideInput ?? input);
      } else {
        data = await seExplorerApi.graphql(gqlQuery);
      }
      setResult(data);
    } catch (err: unknown) {
      setResult({
        ok: false,
        error: (err as Error).message ?? 'Request failed.',
        fetchedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, [input, gqlQuery]);

  function selectPreset(preset: Preset) {
    setActiveId(preset.id);
    setLastPreset(preset);
    setInput('');
    setResult(null);
  }

  function handleFetch() {
    if (activeId === 'graphql') {
      runFetch(null);
    } else {
      runFetch(activePreset ?? null);
    }
  }

  // Group presets
  const groups: Record<string, Preset[]> = {};
  for (const p of PRESETS) {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  }

  const currentPreset = activeId === 'graphql' ? null : activePreset;
  const needsInput = currentPreset?.needsInput;

  return (
    <div className="border border-white/[0.08] rounded-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.02] border-b border-white/[0.06]">
        <Terminal size={14} className="text-brand" />
        <span className="font-display font-extrabold italic text-[13px] uppercase tracking-[0.06em]">
          SE API Explorer
        </span>
        <div className="ml-auto flex items-center gap-3">
          <a
            href="https://dev.sportsengine.com/explorer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-brand/70 hover:text-brand tracking-widest uppercase font-bold transition-colors"
          >
            SE Schema Docs ↗
          </a>
          <span className="text-[10px] text-[#555] uppercase tracking-widest font-bold">
            Read-only · Diagnostic only
          </span>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '220px 1fr', minHeight: '480px' }}>
        {/* Left — endpoint picker */}
        <div className="border-r border-white/[0.06] overflow-y-auto py-2">
          {Object.entries(groups).map(([group, presets]) => (
            <div key={group}>
              <div className="px-3 py-2 text-[9px] font-bold tracking-[0.2em] uppercase text-[#555]">
                {group}
              </div>
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPreset(p)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-[12px] transition-all border-l-2',
                    activeId === p.id
                      ? 'bg-brand/10 text-white border-brand'
                      : 'text-[#888] border-transparent hover:text-white hover:bg-white/[0.03]',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          ))}

          {/* Freeform GraphQL */}
          <div className="mt-1">
            <div className="px-3 py-2 text-[9px] font-bold tracking-[0.2em] uppercase text-[#555]">
              Freeform
            </div>
            <button
              onClick={() => { setActiveId('graphql'); setResult(null); }}
              className={cn(
                'w-full text-left px-3 py-2 text-[12px] transition-all border-l-2 flex items-center gap-1.5',
                activeId === 'graphql'
                  ? 'bg-brand/10 text-white border-brand'
                  : 'text-[#888] border-transparent hover:text-white hover:bg-white/[0.03]',
              )}
            >
              <Search size={11} />GraphQL Query
            </button>
          </div>
        </div>

        {/* Right — controls + response */}
        <div className="flex flex-col">
          {/* Controls bar */}
          <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.01] space-y-2 shrink-0">
            {currentPreset && (
              <p className="text-[11px] text-[#666]">{currentPreset.description}</p>
            )}

            {activeId === 'graphql' ? (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold tracking-widest uppercase text-[#555]">
                  GraphQL Query — mutations blocked
                </div>
                <textarea
                  value={gqlQuery}
                  onChange={(e) => setGqlQuery(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  className="w-full bg-[#181818] border border-white/[0.08] rounded-sm px-2 py-1.5 text-[12px] text-white font-mono outline-none focus:border-brand resize-y"
                />
              </div>
            ) : needsInput ? (
              <div className="flex gap-2 items-center">
                <span className="text-[11px] text-[#555] shrink-0">ID:</span>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={needsInput}
                  className="flex-1 bg-[#181818] border border-white/[0.08] rounded-sm px-2 py-1.5 text-[12px] text-white font-mono outline-none focus:border-brand"
                />
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                disabled={loading || (needsInput?.includes('required') && !input && activeId !== 'graphql')}
                onClick={handleFetch}
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Fetching…' : 'Fetch'}
              </Button>
              {result && (
                <span className="text-[11px] text-[#555]">
                  Last fetched {new Date(result.fetchedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          {/* Response */}
          <div className="flex-1 overflow-hidden">
            <ResponsePane result={result} loading={loading} />
          </div>
        </div>
      </div>
    </div>
  );
}
