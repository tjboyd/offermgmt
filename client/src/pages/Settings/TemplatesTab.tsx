import { useState, useEffect, useCallback, useRef } from 'react';
import { seasonsApi, emailTemplatesApi, type SeasonRow, type EmailTemplate } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { RichTextEditor, normaliseForCompare } from '@/components/ui/RichTextEditor';
import { cn } from '@/lib/utils';

const TEMPLATE_KEYS = [
  { key: 'early_offer',     label: 'Early Offer Letter' },
  { key: 'offer_letter',    label: 'Offer Letter' },
  { key: 'rejection_letter', label: 'Rejection Letter' },
] as const;

const MERGE_FIELDS = [
  { field: '{{playerFirstName}}', desc: "Player's first name" },
  { field: '{{playerLastName}}',  desc: "Player's last name" },
  { field: '{{parentName}}',      desc: "Parent/guardian name" },
  { field: '{{team}}',            desc: 'Team name' },
  { field: '{{season}}',          desc: 'Season label' },
  { field: '{{deadline}}',        desc: 'Offer deadline date' },
  { field: '{{registrationUrl}}', desc: 'Post-acceptance registration link (set on the season)' },
  { field: '{{acceptUrl}}',       desc: 'Accept & Register button URL (auto-injected as a button)' },
  { field: '{{declineUrl}}',      desc: 'Decline button URL (auto-injected as a button)' },
];

const SAMPLE_DATA: Record<string, string> = {
  playerFirstName: 'Alex',
  playerLastName:  'Johnson',
  parentName:      'Sarah Johnson',
  team:            '12U Gold',
  season:          '2027 Season',
  deadline:        'July 25, 2027',
  registrationUrl: 'https://register.example.com/2027',
  acceptUrl:       '#accept',
  declineUrl:      '#decline',
};

function renderPreview(html: string): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_DATA[key] ?? `{{${key}}}`);
}

// ─── Template Editor ──────────────────────────────────────────────────────────

interface TemplateEditorProps {
  template: EmailTemplate;
  onSave: (data: { subject: string; bodyHtml: string }) => Promise<void>;
}

function TemplateEditor({ template, onSave }: TemplateEditorProps) {
  const [subject,  setSubject]  = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.bodyHtml);
  const [tab,      setTab]      = useState<'visual' | 'html' | 'preview'>('visual');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset when template changes
  useEffect(() => {
    setSubject(template.subject);
    setBodyHtml(template.bodyHtml);
    setSaved(false);
    setError(null);
  }, [template.id]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await onSave({ subject, bodyHtml });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  function insertFieldIntoHtml(field: string) {
    const ta = textareaRef.current;
    if (!ta) { setBodyHtml((b) => b + field); return; }
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const next  = bodyHtml.slice(0, start) + field + bodyHtml.slice(end);
    setBodyHtml(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + field.length, start + field.length);
    }, 0);
  }

  // Normalise both sides so <p></p> ↔ <p><br></p> round-trips don't show as unsaved
  const isDirty = subject !== template.subject ||
    normaliseForCompare(bodyHtml) !== normaliseForCompare(template.bodyHtml);

  const TABS = [
    { id: 'visual',   label: 'Visual Editor' },
    { id: 'html',     label: 'Edit HTML' },
    { id: 'preview',  label: 'Preview' },
  ] as const;

  return (
    <div className="space-y-4">
      <Input
        label="Subject Line"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/[0.06]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 py-2 text-[12px] font-bold tracking-widest uppercase border-b-2 -mb-px transition-all',
              tab === t.id ? 'text-white border-brand' : 'text-[#555] border-transparent hover:text-[#AAA]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Visual editor */}
      {tab === 'visual' && (
        <RichTextEditor html={bodyHtml} onChange={setBodyHtml} />
      )}

      {/* Raw HTML editor */}
      {tab === 'html' && (
        <textarea
          ref={textareaRef}
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          rows={14}
          spellCheck={false}
          className="w-full bg-[#181818] border border-white/[0.08] rounded-sm px-3 py-2.5 text-[12px] text-[#CCC] font-mono outline-none focus:border-brand resize-y"
        />
      )}

      {/* Preview — same <p> normalization as the visual editor */}
      {tab === 'preview' && (
        <div className="border border-white/[0.08] rounded-sm min-h-[220px] bg-white overflow-hidden">
          <style>{`
            .jrc-preview p            { margin: 0 0 0.7em 0; padding: 0; min-height: 1.5em; line-height: 1.6; }
            .jrc-preview p:last-child { margin-bottom: 0; }
            .jrc-preview a            { color: #1a6ec8; text-decoration: underline; }
            .jrc-preview strong       { font-weight: bold; }
            .jrc-preview em           { font-style: italic; }
          `}</style>
          <div
            className="jrc-preview p-4 text-[14px] text-[#111]"
            dangerouslySetInnerHTML={{ __html: renderPreview(bodyHtml) }}
          />
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="primary" size="sm" onClick={save} disabled={saving || !isDirty}>
          {saving ? 'Saving…' : 'Save Template'}
        </Button>
        {saved  && <span className="text-[12px] text-green-400">Saved.</span>}
        {error  && <span className="text-[12px] text-[#E07070]">{error}</span>}
        {isDirty && !saved && <span className="text-[12px] text-[#555]">Unsaved changes</span>}
      </div>

      {/* Merge field reference */}
      <details className="group">
        <summary className="cursor-pointer text-[11px] font-bold tracking-widest uppercase text-[#555] hover:text-[#AAA] transition-colors">
          Merge Field Reference
        </summary>
        <div className="mt-2 border border-white/[0.06] rounded-sm overflow-hidden">
          <table className="w-full text-[12px]">
            <tbody>
              {MERGE_FIELDS.map(({ field, desc }) => (
                <tr key={field} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                  <td className="px-3 py-2 font-mono text-brand w-1/3">
                    <button
                      onClick={() => {
                        if (tab === 'html') insertFieldIntoHtml(field);
                        else setBodyHtml((b) => b + field);
                      }}
                      className="hover:underline"
                      title={tab === 'html' ? 'Click to insert at cursor' : 'Click to append'}
                    >
                      {field}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-[#888]">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 bg-white/[0.02] text-[11px] text-[#444]">
            {tab === 'html'
              ? 'Click a field to insert it at the cursor position in the HTML editor.'
              : 'Switch to HTML tab to insert at cursor, or click to append.'}
          </div>
        </div>
      </details>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function TemplatesTab() {
  const [seasons,   setSeasons]   = useState<SeasonRow[]>([]);
  const [seasonId,  setSeasonId]  = useState<string>('');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [activeKey, setActiveKey] = useState<string>('early_offer');
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const loadSeasons = useCallback(async () => {
    try {
      const { seasons: s } = await seasonsApi.list();
      s.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) || a.label.localeCompare(b.label));
      setSeasons(s);
      const active = s.find((x) => x.isActive) ?? s[0];
      if (active) setSeasonId(active.id);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => { loadSeasons(); }, [loadSeasons]);

  const loadTemplates = useCallback(async (sid: string) => {
    if (!sid) return;
    setLoading(true);
    setError(null);
    try {
      const { templates: t } = await emailTemplatesApi.list(sid);
      setTemplates(t);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (seasonId) loadTemplates(seasonId);
  }, [seasonId, loadTemplates]);

  const currentTemplate = templates.find((t) => t.templateKey === activeKey);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-extrabold italic text-[22px] uppercase">Email Templates</h2>
          <p className="text-[12px] text-[#666] mt-0.5">Edit the three email templates for each season.</p>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <label className="text-[10px] font-bold tracking-widest uppercase text-[#555]">Season</label>
          <select
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
            className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none focus:border-brand"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' (Active)' : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-[13px] text-[#E07070]">{error}</p>}

      {loading ? (
        <div className="text-[#555] text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-[200px_1fr] gap-6">
          {/* Template picker */}
          <div className="space-y-1">
            {TEMPLATE_KEYS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveKey(key)}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-sm text-[13px] transition-all',
                  activeKey === key
                    ? 'bg-brand/15 text-white font-bold'
                    : 'text-[#888] hover:text-white hover:bg-white/[0.04]',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div>
            {currentTemplate ? (
              <TemplateEditor
                key={`${seasonId}:${activeKey}`}
                template={currentTemplate}
                onSave={async (data) => {
                  await emailTemplatesApi.update(seasonId, activeKey, data);
                  // Sync saved content back into local state so switching templates
                  // and returning doesn't revert to the pre-save version
                  setTemplates((prev) =>
                    prev.map((t) => t.templateKey === activeKey ? { ...t, ...data } : t)
                  );
                }}
              />
            ) : (
              <div className="text-[#555] text-sm">Template not found for this season.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
