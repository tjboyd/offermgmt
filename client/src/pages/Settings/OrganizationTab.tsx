import { useState, useEffect, useRef } from 'react';
import { X, GripVertical, ExternalLink, Loader2 } from 'lucide-react';
import { brandingApi, configApi } from '@/lib/api';
import { useBranding } from '@/context/BrandingContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

// ─── Sortable grade tag list ───────────────────────────────────────────────────

function GradeSortableList({
  values, onChange, input, onInputChange, onCommit,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  input: string;
  onInputChange: (v: string) => void;
  onCommit: () => void;
}) {
  const dragIdx  = useRef<number | null>(null);
  const overIdx  = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  function onDragStart(i: number) {
    dragIdx.current = i;
    setDragging(i);
  }

  function onDragEnter(i: number) {
    overIdx.current = i;
  }

  function onDragEnd() {
    const from = dragIdx.current;
    const to   = overIdx.current;
    if (from !== null && to !== null && from !== to) {
      const next = [...values];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onChange(next);
    }
    dragIdx.current = null;
    overIdx.current = null;
    setDragging(null);
  }

  return (
    <div className="flex flex-wrap gap-1.5 min-h-[36px] bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-2 py-2 focus-within:border-brand transition-colors">
      {values.map((g, i) => (
        <span
          key={g}
          draggable
          onDragStart={() => onDragStart(i)}
          onDragEnter={() => onDragEnter(i)}
          onDragEnd={onDragEnd}
          onDragOver={(e) => e.preventDefault()}
          className={`flex items-center gap-1 text-[12px] text-white rounded px-1.5 py-0.5 select-none transition-opacity ${
            dragging === i ? 'opacity-40' : 'bg-white/[0.08]'
          }`}
        >
          <GripVertical size={11} className="text-[#555] cursor-grab active:cursor-grabbing shrink-0" />
          {g}
          <button
            type="button"
            onClick={() => onChange(values.filter((v) => v !== g))}
            className="text-[#777] hover:text-white transition-colors ml-0.5"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); onCommit(); }
          else if (e.key === 'Backspace' && !input && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={onCommit}
        placeholder={values.length === 0 ? 'Type a grade and press Enter or comma (e.g. 3rd, 4th, 5th)' : 'Add another…'}
        className="flex-1 min-w-[160px] bg-transparent text-[13px] text-white placeholder:text-[#444] outline-none"
      />
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const valid = !value || HEX_RE.test(value);
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium text-[#888] uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded border border-white/10 shrink-0 transition-colors"
          style={{ backgroundColor: valid && value ? value : 'transparent' }}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#AD0303"
          error={valid ? undefined : 'Invalid hex color'}
          className="font-mono"
        />
      </div>
    </div>
  );
}

export function OrganizationTab() {
  const { branding, refresh, applyColors } = useBranding();
  const [orgName,        setOrgName]        = useState('');
  const [logoUrl,        setLogoUrl]        = useState('');
  const [primary,        setPrimary]        = useState('');
  const [secondary,      setSecondary]      = useState('');
  const [orgLocation,    setOrgLocation]    = useState('');
  const [orgWebsite,     setOrgWebsite]     = useState('');
  const [orgContactEmail,setOrgContactEmail]= useState('');
  const [instructions,   setInstructions]   = useState('');
  // Org details save state
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  // Accept page save state (separate)
  const [savingPage,     setSavingPage]     = useState(false);
  const [savedPage,      setSavedPage]      = useState(false);
  const [errorPage,      setErrorPage]      = useState<string | null>(null);

  // Accept page preview
  const [previewHtml,    setPreviewHtml]    = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPreview,    setShowPreview]    = useState(false);
  const [previewPage,    setPreviewPage]    = useState<'accept' | 'expired'>('accept');

  // Grade values config
  const [gradeValues,     setGradeValues]     = useState<string[]>([]);
  const [gradeInput,      setGradeInput]      = useState('');
  const [savingGrades,    setSavingGrades]    = useState(false);
  const [savedGrades,     setSavedGrades]     = useState(false);
  const [gradeError,      setGradeError]      = useState<string | null>(null);

  useEffect(() => {
    configApi.get().then((r) => {
      const raw = r.config['gradeValues'];
      if (Array.isArray(raw)) setGradeValues(raw as string[]);
      else if (typeof raw === 'string') {
        try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) setGradeValues(parsed); } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  function commitGradeInput() {
    const trimmed = gradeInput.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    setGradeValues((prev) => Array.from(new Set([...prev, ...parts])));
    setGradeInput('');
  }

  async function handleSaveGrades() {
    setSavingGrades(true); setGradeError(null); setSavedGrades(false);
    try {
      await configApi.update({ gradeValues: JSON.stringify(gradeValues) });
      setSavedGrades(true);
      setTimeout(() => setSavedGrades(false), 3000);
    } catch (e: unknown) {
      setGradeError((e as Error).message);
    } finally {
      setSavingGrades(false);
    }
  }

  // Populate fields once branding loads
  useEffect(() => {
    if (branding) {
      setOrgName(branding.orgName ?? '');
      setLogoUrl(branding.logoUrl ?? '');
      setPrimary(branding.brandPrimary ?? '#AD0303');
      setSecondary(branding.brandSecondary ?? '');
      setOrgLocation(branding.orgLocation ?? '');
      setOrgWebsite(branding.orgWebsite ?? '');
      setOrgContactEmail(branding.orgContactEmail ?? '');
      setInstructions(branding.acceptPageInstructions ?? '');
    }
  }, [branding]);

  async function loadPreview(page: 'accept' | 'expired' = previewPage) {
    setPreviewPage(page);
    setPreviewLoading(true);
    try {
      const html = await brandingApi.acceptPreview(page);
      setPreviewHtml(html);
      setShowPreview(true);
    } catch { /* ignore */ }
    finally { setPreviewLoading(false); }
  }

  // Live preview — apply brand colors immediately as user types a valid hex
  useEffect(() => {
    if (HEX_RE.test(primary)) {
      applyColors(primary);
    }
  }, [primary, applyColors]);

  const canSave = (!primary || HEX_RE.test(primary)) && (!secondary || HEX_RE.test(secondary));

  async function handleSaveOrgDetails() {
    setSaving(true); setError(null); setSaved(false);
    try {
      await brandingApi.patch({
        orgName:         orgName        || undefined,
        logoUrl:         logoUrl        || undefined,
        brandPrimary:    primary        || undefined,
        brandSecondary:  secondary      || undefined,
        orgLocation:     orgLocation    || null,
        orgWebsite:      orgWebsite     || null,
        orgContactEmail: orgContactEmail|| null,
      });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAcceptPage() {
    setSavingPage(true); setErrorPage(null); setSavedPage(false);
    try {
      await brandingApi.patch({ acceptPageInstructions: instructions || null });
      setSavedPage(true);
      setTimeout(() => setSavedPage(false), 3000);
    } catch (e: unknown) {
      setErrorPage((e as Error).message);
    } finally {
      setSavingPage(false);
    }
  }

  return (
    <div className="space-y-0 max-w-lg divide-y divide-white/[0.06]">

      {/* ── Organization Details ──────────────────────────────────────────── */}
      <div className="space-y-4 pb-6">
        <div>
          <h2 className="font-display font-extrabold italic text-[22px] uppercase">Organization</h2>
          <p className="text-[12px] text-[#666] mt-0.5">Name, logo, brand colors, and contact info used across the app and public pages.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-[#888] uppercase tracking-wider">Organization Name</label>
          <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Jr Chargers" />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-[#888] uppercase tracking-wider">
            Logo URL <span className="text-[#555] normal-case">(optional)</span>
          </label>
          <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
        </div>

        <ColorInput label="Primary Color" value={primary} onChange={setPrimary} />
        <ColorInput label="Secondary Color (optional)" value={secondary} onChange={setSecondary} />

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-[#888] uppercase tracking-wider">
            Location <span className="text-[#555] normal-case">(city, province/state — shown in page footer)</span>
          </label>
          <Input value={orgLocation} onChange={(e) => setOrgLocation(e.target.value)} placeholder="Hamilton, ON" />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-[#888] uppercase tracking-wider">
            Website <span className="text-[#555] normal-case">(optional)</span>
          </label>
          <Input value={orgWebsite} onChange={(e) => setOrgWebsite(e.target.value)} placeholder="https://jrchargersbaseball.com" />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-[#888] uppercase tracking-wider">
            Contact Email <span className="text-[#555] normal-case">(shown on expired offer page)</span>
          </label>
          <Input value={orgContactEmail} onChange={(e) => setOrgContactEmail(e.target.value)} placeholder="board@example.com" type="email" />
        </div>

        {error && <p className="text-[13px] text-[#E07070]">{error}</p>}
        <div className="flex items-center gap-3 pt-1">
          <Button variant="primary" onClick={handleSaveOrgDetails} disabled={saving || !canSave}>
            {saving ? 'Saving…' : 'Save Organization Details'}
          </Button>
          {saved && <span className="text-[13px] text-[#66C97A]">Saved ✓</span>}
        </div>
      </div>

      {/* ── Offer Acceptance Page ─────────────────────────────────────────── */}
      <div className="space-y-3 pt-6 pb-6">
        <div>
          <h3 className="font-display font-extrabold italic text-[16px] uppercase">Offer Acceptance Page</h3>
          <p className="text-[12px] text-[#666] mt-0.5">
            Customize the instruction text families see when they click the accept link in their offer email.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-[#888] uppercase tracking-wider">Instruction Text</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-sm text-white outline-none focus:border-brand resize-y"
            placeholder="Click the button below to confirm your acceptance. You'll then be directed to complete your registration."
          />
          <p className="text-[11px] text-[#555]">
            Appears below the player name and deadline on the accept page. Leave blank to use the default text.
          </p>
        </div>

        {errorPage && <p className="text-[13px] text-[#E07070]">{errorPage}</p>}
        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={handleSaveAcceptPage} disabled={savingPage}>
            {savingPage ? 'Saving…' : 'Save Instruction Text'}
          </Button>
          {savedPage && <span className="text-[13px] text-[#66C97A]">Saved ✓</span>}
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button variant="ghost" size="sm" onClick={() => loadPreview('accept')} disabled={previewLoading}>
            {previewLoading && previewPage === 'accept' ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            Preview Accept Page
          </Button>
          <Button variant="ghost" size="sm" onClick={() => loadPreview('expired')} disabled={previewLoading}>
            {previewLoading && previewPage === 'expired' ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            Preview Expired Page
          </Button>
        </div>

        {showPreview && previewHtml && (
          <div className="border border-white/[0.08] rounded-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[#111] border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-[#555] uppercase tracking-widest">
                  {previewPage === 'accept' ? 'Accept Page Preview' : 'Expired Offer Page Preview'}
                </span>
                <div className="flex gap-1">
                  {(['accept', 'expired'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => loadPreview(p)}
                      className={`text-[10px] px-2 py-0.5 rounded-sm border transition-colors ${
                        previewPage === p
                          ? 'border-brand text-white bg-brand/10'
                          : 'border-white/[0.1] text-[#555] hover:text-[#AAA]'
                      }`}
                    >
                      {p === 'accept' ? 'Accept' : 'Expired'}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowPreview(false)} className="text-[#555] hover:text-white text-[11px]">✕ Close</button>
            </div>
            <iframe
              srcDoc={previewHtml}
              className="w-full border-0"
              style={{ height: '680px' }}
              title="Page preview"
              sandbox="allow-same-origin"
            />
          </div>
        )}
      </div>

      {/* ── Grade Values ─────────────────────────────────────────────────── */}
      <div className="space-y-3 pt-6 pb-2">
        <div>
          <h3 className="font-display font-extrabold italic text-[16px] uppercase">Grade Values</h3>
          <p className="text-[12px] text-[#666] mt-0.5">
            Define the grade labels used across your system. These values appear as checkboxes when
            configuring division eligibility rules, and should match however grades are recorded in
            your registration platform (e.g. SportsEngine uses "3rd", "4th"; another system may use "Grade 3").
          </p>
        </div>

        {/* Draggable tag list */}
        <GradeSortableList
          values={gradeValues}
          onChange={setGradeValues}
          input={gradeInput}
          onInputChange={setGradeInput}
          onCommit={commitGradeInput}
        />

        <p className="text-[11px] text-[#555]">
          Drag the <GripVertical size={10} className="inline mb-0.5" /> handle on any grade to reorder.
        </p>

        {gradeError && <p className="text-[12px] text-[#E07070]">{gradeError}</p>}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleSaveGrades} disabled={savingGrades}>
            {savingGrades ? 'Saving…' : 'Save Grade Values'}
          </Button>
          {savedGrades && <span className="text-[12px] text-[#66C97A]">Saved ✓</span>}
        </div>
      </div>
    </div>
  );
}
