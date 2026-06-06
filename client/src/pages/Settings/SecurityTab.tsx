import { useState, useEffect, useCallback } from 'react';
import { Plus, X, ShieldAlert } from 'lucide-react';
import { configApi, apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface SecurityConfig {
  allowed_email_domains:  string[];
  session_timeout_hours:  number;
  password_min_length:    number;
  password_require_upper: boolean;
  password_require_digit: boolean;
}

const DEFAULTS: SecurityConfig = {
  allowed_email_domains:  ['jrchargersbaseball.com'],
  session_timeout_hours:  8,
  password_min_length:    8,
  password_require_upper: false,
  password_require_digit: false,
};

// ─── Force All Resets Section ─────────────────────────────────────────────────

function ForceAllResetsSection() {
  const PHRASE = 'RESET ALL PASSWORDS';
  const [typed, setTyped]   = useState('');
  const [busy,  setBusy]    = useState(false);
  const [done,  setDone]    = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleForce() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/users/force-all-reset', { method: 'POST' });
      setDone(true);
      setTyped('');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-brand/30 rounded-sm p-5 space-y-3 bg-brand/[0.03]">
      <div className="flex items-center gap-2 text-brand">
        <ShieldAlert size={16} />
        <span className="font-display font-extrabold italic text-[14px] uppercase tracking-[0.06em]">Force All Password Resets</span>
      </div>
      <p className="text-[12px] text-[#888]">
        Invalidates all active sessions immediately. Every user will be required to reset their password on next login. Use only in response to a suspected credential breach.
      </p>
      {done && <p className="text-[12px] text-green-400">All sessions invalidated. Users will be prompted to reset on next login.</p>}
      {!done && (
        <>
          <Input
            label={`Type "${PHRASE}" to enable`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={PHRASE}
          />
          {error && <p className="text-[12px] text-[#E07070]">{error}</p>}
          <Button
            variant="outline-red"
            size="sm"
            disabled={typed !== PHRASE || busy}
            onClick={handleForce}
          >
            {busy ? 'Working…' : 'Force All Resets'}
          </Button>
        </>
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function SecurityTab() {
  const [cfg,       setCfg]       = useState<SecurityConfig>(DEFAULTS);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const [newDomain, setNewDomain] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { config } = await configApi.get();
      setCfg({
        allowed_email_domains:  (config.allowed_email_domains as string[])  ?? DEFAULTS.allowed_email_domains,
        session_timeout_hours:  (config.session_timeout_hours  as number)   ?? DEFAULTS.session_timeout_hours,
        password_min_length:    (config.password_min_length    as number)   ?? DEFAULTS.password_min_length,
        password_require_upper: (config.password_require_upper as boolean)  ?? DEFAULTS.password_require_upper,
        password_require_digit: (config.password_require_digit as boolean)  ?? DEFAULTS.password_require_digit,
      });
    } catch (err: unknown) {
      setLoadError((err as Error).message ?? 'Failed to load security settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function addDomain() {
    const d = newDomain.trim().toLowerCase().replace(/^@/, '');
    if (!d || cfg.allowed_email_domains.includes(d)) return;
    setCfg((c) => ({ ...c, allowed_email_domains: [...c.allowed_email_domains, d] }));
    setNewDomain('');
  }

  function removeDomain(d: string) {
    setCfg((c) => ({ ...c, allowed_email_domains: c.allowed_email_domains.filter((x) => x !== d) }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await configApi.update(cfg as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-[#555] text-sm">Loading…</div>;

  if (loadError) return (
    <div className="text-[#E07070] text-sm">Failed to load security settings: {loadError}</div>
  );

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h2 className="font-display font-extrabold italic text-[22px] uppercase">Security</h2>
        <p className="text-[12px] text-[#666] mt-0.5">Configure auth policy, session timeouts, and emergency controls.</p>
      </div>

      {/* Email Domains */}
      <section className="space-y-3">
        <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888]">Allowed Email Domains</div>
        <p className="text-[12px] text-[#666]">Only addresses matching these domains can be invited to the system.</p>
        <div className="flex flex-wrap gap-2">
          {cfg.allowed_email_domains.map((d) => (
            <span key={d} className="flex items-center gap-1.5 bg-white/[0.06] border border-white/[0.08] rounded-sm px-2.5 py-1 text-[12px] text-[#CCC]">
              @{d}
              <button onClick={() => removeDomain(d)} className="text-[#555] hover:text-[#E07070] transition-colors">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDomain())}
            placeholder="e.g. jrchargersbaseball.com"
            className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none flex-1 placeholder:text-[#444] focus:border-brand"
          />
          <Button variant="outline" size="sm" onClick={addDomain}><Plus size={13} />Add</Button>
        </div>
      </section>

      {/* Session */}
      <section className="space-y-3">
        <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888]">Session Timeout</div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={72}
            value={cfg.session_timeout_hours}
            onChange={(e) => setCfg((c) => ({ ...c, session_timeout_hours: Number(e.target.value) }))}
            className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none w-24 focus:border-brand"
          />
          <span className="text-[13px] text-[#888]">hours of inactivity</span>
        </div>
      </section>

      {/* Password Policy */}
      <section className="space-y-3">
        <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888]">Password Policy</div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={6}
            max={64}
            value={cfg.password_min_length}
            onChange={(e) => setCfg((c) => ({ ...c, password_min_length: Number(e.target.value) }))}
            className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none w-24 focus:border-brand"
          />
          <span className="text-[13px] text-[#888]">minimum character length</span>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-[#CCC] cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.password_require_upper}
            onChange={(e) => setCfg((c) => ({ ...c, password_require_upper: e.target.checked }))}
            className="accent-brand"
          />
          Require at least one uppercase letter
        </label>
        <label className="flex items-center gap-2 text-[13px] text-[#CCC] cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.password_require_digit}
            onChange={(e) => setCfg((c) => ({ ...c, password_require_digit: e.target.checked }))}
            className="accent-brand"
          />
          Require at least one number
        </label>
      </section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
        {saved && <span className="text-[12px] text-green-400">Saved.</span>}
        {error && <span className="text-[12px] text-[#E07070]">{error}</span>}
      </div>

      <div className="border-t border-white/[0.06] pt-6">
        <ForceAllResetsSection />
      </div>
    </div>
  );
}
