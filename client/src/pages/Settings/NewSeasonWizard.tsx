import { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, X, ChevronRight } from 'lucide-react';
import { seasonsApi, wizardApi, emailTemplatesApi, type SeasonRow, type EmailTemplate } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

interface WizardProps {
  onComplete: (season: SeasonRow) => void;
  onClose:    () => void;
}

const STEPS = ['Season Details', 'Email Templates', 'Integration Check', 'Confirm & Activate'];

// ─── Step 1: Season Details ───────────────────────────────────────────────────

interface Step1Data {
  label:             string;
  seRegistrationUrl: string;
  seTryoutFormNames: string;
  offerExpiresDays:  number;
  tryoutStart:       string;
  tryoutEnd:         string;
  copyFromSeasonId:  string;
}

function Step1({
  seasons,
  initial,
  onNext,
}: {
  seasons: SeasonRow[];
  initial: Step1Data;
  onNext: (data: Step1Data, wizardId: string, carryForward: unknown) => void;
}) {
  const [form, setForm] = useState<Step1Data>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priorSeasons = seasons.filter((s) => !s.isArchived || s.isActive);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { wizardId, carryForward } = await wizardApi.step1({
        ...form,
        seTryoutFormNames: form.seTryoutFormNames.split('\n').map((s) => s.trim()).filter(Boolean),
        copyFromSeasonId:  form.copyFromSeasonId || undefined,
      });
      onNext(form, wizardId, carryForward);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Input
        label="Season Label"
        value={form.label}
        onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
        placeholder="e.g. 2028 Season"
        required
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888]">Copy Templates From</label>
        <select
          value={form.copyFromSeasonId}
          onChange={(e) => setForm((f) => ({ ...f, copyFromSeasonId: e.target.value }))}
          className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none focus:border-brand"
        >
          <option value="">— Start with blank templates —</option>
          {priorSeasons.map((s) => (
            <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' (Active)' : ''}</option>
          ))}
        </select>
        <p className="text-[11px] text-[#555]">Email templates will be copied from the selected season. You can edit them in Step 2.</p>
      </div>

      <Input
        label="SE Registration URL"
        type="url"
        value={form.seRegistrationUrl}
        onChange={(e) => setForm((f) => ({ ...f, seRegistrationUrl: e.target.value }))}
        placeholder="https://..."
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888]">SE Tryout Form Names (one per line)</label>
        <textarea
          value={form.seTryoutFormNames}
          onChange={(e) => setForm((f) => ({ ...f, seTryoutFormNames: e.target.value }))}
          rows={3}
          className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none focus:border-brand resize-none"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold tracking-widest uppercase text-[#888]">Offer Expires (days)</label>
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
        />
        <Input
          label="Tryout End"
          type="date"
          value={form.tryoutEnd}
          onChange={(e) => setForm((f) => ({ ...f, tryoutEnd: e.target.value }))}
        />
      </div>

      {error && <p className="text-[12px] text-[#E07070]">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={busy || !form.label}>
          {busy ? 'Saving…' : 'Next'} <ChevronRight size={14} />
        </Button>
      </div>
    </form>
  );
}

// ─── Step 2: Template Review ──────────────────────────────────────────────────

const TEMPLATE_KEYS = [
  { key: 'early_offer',     label: 'Early Offer Letter' },
  { key: 'offer_letter',    label: 'Offer Letter' },
  { key: 'rejection_letter', label: 'Rejection Letter' },
];

function Step2({
  wizardId,
  copyFromSeasonId,
  onNext,
  onBack,
}: {
  wizardId: string;
  copyFromSeasonId: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [activeKey, setActiveKey] = useState('early_offer');
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!copyFromSeasonId) { setLoading(false); return; }
      try {
        const { templates: t } = await emailTemplatesApi.list(copyFromSeasonId);
        setTemplates(t);
      } catch {}
      setLoading(false);
    }
    load();
  }, [copyFromSeasonId]);

  function updateTemplate(key: string, field: 'subject' | 'bodyHtml', value: string) {
    setTemplates((ts) => ts.map((t) =>
      t.templateKey === key ? { ...t, [field]: value } : t,
    ));
  }

  async function next() {
    setBusy(true);
    setError(null);
    try {
      await wizardApi.step2({
        wizardId,
        templates: templates.map((t) => ({ key: t.templateKey, subject: t.subject, bodyHtml: t.bodyHtml })),
      });
      onNext();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed.');
      setBusy(false);
    }
  }

  if (loading) return <div className="text-[#555] text-sm py-4">Loading templates…</div>;

  const active = templates.find((t) => t.templateKey === activeKey);

  return (
    <div className="space-y-4">
      {templates.length === 0 ? (
        <p className="text-[13px] text-[#888]">No source season selected — default templates will be created when the season is activated. You can edit them in Settings → Email Templates afterward.</p>
      ) : (
        <>
          <div className="flex gap-1">
            {TEMPLATE_KEYS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveKey(key)}
                className={cn(
                  'px-3 py-2 text-[12px] font-bold tracking-widest uppercase rounded-sm transition-all',
                  activeKey === key ? 'bg-brand/15 text-white' : 'text-[#555] hover:text-[#AAA]',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {active && (
            <div className="space-y-3">
              <input
                value={active.subject}
                onChange={(e) => updateTemplate(activeKey, 'subject', e.target.value)}
                placeholder="Subject line"
                className="w-full bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none focus:border-brand"
              />
              <textarea
                value={active.bodyHtml}
                onChange={(e) => updateTemplate(activeKey, 'bodyHtml', e.target.value)}
                rows={10}
                className="w-full bg-[#181818] border border-white/[0.08] rounded-sm px-3 py-2.5 text-[12px] text-[#CCC] font-mono outline-none focus:border-brand resize-y"
              />
            </div>
          )}
        </>
      )}

      {error && <p className="text-[12px] text-[#E07070]">{error}</p>}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button variant="primary" disabled={busy} onClick={next}>
          {busy ? 'Saving…' : 'Next'} <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Integration Checks ───────────────────────────────────────────────

function Step3({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [checks,  setChecks]  = useState<Array<{ name: string; status: string; detail: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    wizardApi.step3Check().then(({ checks: c }) => { setChecks(c); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const allOk = checks.every((c) => c.status === 'ok');

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-[#888]">Verifying integration credentials before activating the new season.</p>

      {loading ? (
        <div className="text-[#555] text-sm">Checking…</div>
      ) : (
        <div className="space-y-3">
          {checks.map((c) => (
            <div key={c.name} className={cn(
              'flex items-start gap-3 px-4 py-3 rounded-sm border',
              c.status === 'ok' ? 'border-green-700/40 bg-green-900/10' : 'border-yellow-600/40 bg-yellow-900/10',
            )}>
              {c.status === 'ok'
                ? <CheckCircle2 size={16} className="text-green-400 mt-0.5 shrink-0" />
                : <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />}
              <div>
                <div className="text-[13px] font-bold text-white">{c.name}</div>
                <div className="text-[12px] text-[#888]">{c.detail}</div>
              </div>
            </div>
          ))}
          {!allOk && (
            <p className="text-[12px] text-yellow-400">
              Some integrations have issues. You can still proceed — configure credentials in Settings → Integrations after setup.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button variant="primary" disabled={loading} onClick={onNext}>
          Next <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Confirm & Activate ───────────────────────────────────────────────

function Step4({
  wizardId,
  step1Data,
  onComplete,
  onBack,
}: {
  wizardId:  string;
  step1Data: Step1Data;
  onComplete: (season: SeasonRow) => void;
  onBack: () => void;
}) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const { season } = await wizardApi.commit(wizardId);
      onComplete(season);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to create season.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-[#888]">Review your settings and activate the new season.</p>

      <div className="border border-white/[0.08] rounded-sm divide-y divide-white/[0.06]">
        {[
          ['Label',          step1Data.label],
          ['Registration URL', step1Data.seRegistrationUrl || '—'],
          ['Offer Expires',  `${step1Data.offerExpiresDays} days`],
          ['Tryout Start',   step1Data.tryoutStart || '—'],
          ['Tryout End',     step1Data.tryoutEnd || '—'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center px-4 py-2.5 text-[13px]">
            <span className="text-[#555] w-36 shrink-0">{label}</span>
            <span className="text-[#CCC]">{value}</span>
          </div>
        ))}
      </div>

      <div className="border border-brand/30 rounded-sm p-4 bg-brand/[0.04]">
        <p className="text-[13px] text-white font-bold">Activating this season will:</p>
        <ul className="mt-2 space-y-1 text-[12px] text-[#AAA] list-disc list-inside">
          <li>Create the new season record</li>
          <li>Copy and save the email templates</li>
          <li>Mark this season as Active (deactivating the current one)</li>
        </ul>
      </div>

      {error && <p className="text-[12px] text-[#E07070]">{error}</p>}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button variant="primary" disabled={busy} onClick={commit}>
          {busy ? 'Activating…' : 'Activate Season'}
        </Button>
      </div>
    </div>
  );
}

// ─── Wizard Shell ─────────────────────────────────────────────────────────────

export function NewSeasonWizard({ onComplete, onClose }: WizardProps) {
  const [step, setStep] = useState(0);
  const [seasons,    setSeasons]    = useState<SeasonRow[]>([]);
  const [wizardId,   setWizardId]   = useState('');
  const [step1Data,  setStep1Data]  = useState<Step1Data>({
    label: '', seRegistrationUrl: '', seTryoutFormNames: '',
    offerExpiresDays: 14, tryoutStart: '', tryoutEnd: '', copyFromSeasonId: '',
  });

  useEffect(() => {
    seasonsApi.list().then(({ seasons: s }) => setSeasons(s)).catch(() => {});
  }, []);

  async function handleDiscard() {
    if (wizardId) {
      try { await wizardApi.discard(wizardId); } catch {}
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1A1A1A] border border-white/[0.08] rounded-md w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-brand mb-0.5">Setup Wizard</div>
            <h2 className="font-display font-extrabold italic text-[24px] uppercase">New Season</h2>
          </div>
          <button onClick={handleDiscard} className="text-[#555] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 py-4 gap-0 border-b border-white/[0.06]">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className={cn(
                'flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest',
                i === step ? 'text-white' : i < step ? 'text-brand' : 'text-[#444]',
              )}>
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                  i === step ? 'bg-brand text-white' : i < step ? 'bg-brand/20 text-brand' : 'bg-white/[0.06] text-[#444]',
                )}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span className="hidden sm:block">{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('flex-1 h-px mx-2', i < step ? 'bg-brand/40' : 'bg-white/[0.06]')} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 0 && (
            <Step1
              seasons={seasons}
              initial={step1Data}
              onNext={(data, wid, _cf) => {
                setStep1Data(data);
                setWizardId(wid);
                setStep(1);
              }}
            />
          )}
          {step === 1 && (
            <Step2
              wizardId={wizardId}
              copyFromSeasonId={step1Data.copyFromSeasonId}
              onNext={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <Step3
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <Step4
              wizardId={wizardId}
              step1Data={step1Data}
              onComplete={onComplete}
              onBack={() => setStep(2)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
