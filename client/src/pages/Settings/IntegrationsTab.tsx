import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, Unplug, RefreshCw, Zap, FlaskConical } from 'lucide-react';
import { integrationsApi, type IntegrationStatus, type EmailProvider } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { SEExplorerPanel } from './SEExplorerPanel';

type TopTab = 'sportsengine' | 'email';

export function IntegrationsTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [topTab, setTopTab] = useState<TopTab>('sportsengine');
  const [status,         setStatus]         = useState<IntegrationStatus | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [switchingProv,  setSwitchingProv]  = useState(false);
  const [provResult,     setProvResult]     = useState<{ ok: boolean; message: string } | null>(null);
  const [togglingTest,   setTogglingTest]   = useState(false);

  async function loadStatus() {
    try {
      setLoading(true);
      setStatus(await integrationsApi.status());
    } catch { /* shown in child components */ }
    finally  { setLoading(false); }
  }

  async function handleSetEmailProvider(p: EmailProvider) {
    setSwitchingProv(true); setProvResult(null);
    try {
      await integrationsApi.setEmailProvider(p);
      setProvResult({ ok: true, message: `Active provider set to ${p === 'sendgrid' ? 'SendGrid' : 'Resend'}.` });
      await loadStatus();
    } catch (e) {
      setProvResult({ ok: false, message: e instanceof Error ? e.message : 'Failed to update provider.' });
    } finally { setSwitchingProv(false); }
  }

  async function handleToggleTestMode(enable: boolean) {
    setTogglingTest(true);
    try {
      await integrationsApi.setTestMode(enable);
      await loadStatus();
    } catch { /* ignore */ }
    finally { setTogglingTest(false); }
  }

  useEffect(() => { loadStatus(); }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#666] py-8">
        <Loader2 size={16} className="animate-spin" />
        <span>Loading integration status…</span>
      </div>
    );
  }

  const emailConfigured = (status?.sendgrid?.configured || status?.resend?.configured) ?? false;
  const seConfigured    = status?.sportsengine?.configured ?? false;

  return (
    <div className="flex flex-col gap-6">

      {/* Top-level tab nav: SportsEngine | Email */}
      <div className="flex gap-2 border-b border-white/[0.06] pb-0">
        {([
          { id: 'sportsengine' as TopTab, label: 'SportsEngine', configured: seConfigured },
          { id: 'email'        as TopTab, label: 'Email',         configured: emailConfigured },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTopTab(t.id)}
            className={cn(
              'flex items-center gap-2.5 px-5 py-3 border-b-2 -mb-px transition-all duration-150',
              'font-display font-bold italic text-[13px] uppercase tracking-[0.06em]',
              topTab === t.id
                ? 'border-brand text-white'
                : 'border-transparent text-[#555] hover:text-[#AAA]',
            )}
          >
            {t.label}
            <span className={cn(
              'text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded border transition-colors',
              t.configured
                ? 'text-[#66C97A] bg-[#46B35A]/10 border-[#46B35A]/30'
                : 'text-[#444] bg-white/[0.03] border-white/[0.06]',
            )}>
              {t.configured ? '● On' : '○ Off'}
            </span>
          </button>
        ))}
      </div>

      {/* SportsEngine panel */}
      {topTab === 'sportsengine' && (
        <div className="flex flex-col gap-6">
          <div className="max-w-2xl">
            <SECard status={status?.sportsengine} onSaved={loadStatus} />
          </div>
          {isAdmin && (
            <div>
              <div className="mb-3">
                <h3 className="font-display font-extrabold italic text-[18px] uppercase tracking-[0.04em]">
                  API Explorer
                </h3>
                <p className="text-[12px] text-[#666] mt-0.5">
                  Browse raw SportsEngine API responses to validate credentials, inspect form schemas, and
                  confirm data structure before running a sync or import. All calls are read-only.
                </p>
              </div>
              <SEExplorerPanel />
            </div>
          )}
        </div>
      )}

      {/* Email panel */}
      {topTab === 'email' && (() => {
        const activeProvider  = status?.emailProvider ?? 'sendgrid';
        const testMode        = status?.testMode ?? false;
        const activeTestEmail = activeProvider === 'sendgrid'
          ? (status?.sendgrid?.testEmail ?? null)
          : (status?.resend?.testEmail   ?? null);
        const canEnableTest = !!activeTestEmail;

        return (
          <div className="flex flex-col gap-5 max-w-2xl">

            {/* Provider toggle + test mode — single row */}
            <div className="flex items-center justify-between gap-4 flex-wrap">

              {/* Provider buttons */}
              <div className="flex items-center gap-2">
                {(['sendgrid', 'resend'] as const).map((p) => {
                  const isActive = activeProvider === p;
                  return (
                    <button
                      key={p}
                      disabled={switchingProv || isActive}
                      onClick={() => handleSetEmailProvider(p)}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-sm border text-[13px] font-semibold transition-all',
                        isActive
                          ? 'border-brand bg-brand/10 text-white cursor-default'
                          : 'border-white/[0.10] text-[#666] hover:border-white/25 hover:text-[#AAA]',
                      )}
                    >
                      {switchingProv && !isActive && <Loader2 size={12} className="animate-spin" />}
                      {isActive && <Zap size={12} className="text-brand" />}
                      {p === 'sendgrid' ? 'SendGrid' : 'Resend'}
                    </button>
                  );
                })}
                {provResult && (
                  <span className={cn(
                    'flex items-center gap-1.5 text-[12px] ml-1',
                    provResult.ok ? 'text-[#66C97A]' : 'text-[#E07070]',
                  )}>
                    {provResult.ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
                    {provResult.message}
                  </span>
                )}
              </div>

              {/* Test mode toggle */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <FlaskConical size={13} className={testMode ? 'text-[#C8A22A]' : 'text-[#444]'} />
                  <span className={cn('text-[12px] font-semibold', testMode ? 'text-[#C8A22A]' : 'text-[#555]')}>
                    Test Mode
                  </span>
                </div>
                <button
                  role="switch"
                  aria-checked={testMode}
                  disabled={togglingTest || (!canEnableTest && !testMode)}
                  onClick={() => canEnableTest || testMode ? handleToggleTestMode(!testMode) : undefined}
                  title={!canEnableTest && !testMode ? 'Set a test email address below to enable test mode' : undefined}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                    testMode
                      ? 'border-[#C8A22A] bg-[#C8A22A]'
                      : canEnableTest
                        ? 'border-white/20 bg-white/[0.08] hover:border-white/30'
                        : 'border-white/[0.06] bg-white/[0.03] cursor-not-allowed opacity-50',
                  )}
                >
                  {togglingTest
                    ? <Loader2 size={10} className="absolute inset-0 m-auto animate-spin text-white" />
                    : <span className={cn(
                        'pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 mt-[1px]',
                        testMode ? 'translate-x-4' : 'translate-x-0.5',
                      )} />
                  }
                </button>
              </div>
            </div>

            {/* Info when test mode can't be enabled */}
            {!canEnableTest && !testMode && (
              <div className="flex items-start gap-2 text-[12px] text-[#666] bg-white/[0.02] border border-white/[0.06] rounded-sm px-3 py-2.5">
                <FlaskConical size={13} className="text-[#444] mt-px shrink-0" />
                <span>
                  To enable Test Mode, add a <span className="text-[#AAA]">Test Email Address</span> in the{' '}
                  {activeProvider === 'sendgrid' ? 'SendGrid' : 'Resend'} configuration below.
                  All emails will be redirected to that address when enabled.
                </span>
              </div>
            )}

            {/* Test mode active banner */}
            {testMode && (
              <div className="flex items-start gap-2 text-[12px] font-semibold text-[#C8A22A] bg-[#C8A22A]/[0.06] border border-[#C8A22A]/30 rounded-sm px-3 py-2.5">
                <FlaskConical size={13} className="mt-px shrink-0" />
                <span>
                  Test Mode is <strong>ON</strong> — all offer emails will be redirected to{' '}
                  <span className="font-mono">{activeTestEmail}</span> instead of real recipients.
                </span>
              </div>
            )}

            {/* Active provider config card */}
            {activeProvider === 'sendgrid'
              ? <SGCard status={status?.sendgrid} onSaved={loadStatus} />
              : <ResendCard status={status?.resend} onSaved={loadStatus} />
            }
          </div>
        );
      })()}
    </div>
  );
}


// ─── SportsEngine card ────────────────────────────────────────────────────────

function SECard({
  status,
  onSaved,
}: { status?: IntegrationStatus['sportsengine']; onSaved: () => void }) {
  const [clientId,    setClientId]    = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [orgId,       setOrgId]       = useState(status?.orgId ? String(status.orgId) : '');
  const [saving,      setSaving]      = useState(false);
  const [testing,     setTesting]     = useState(false);
  const [testResult,  setTestResult]  = useState<{ ok: boolean; message: string } | null>(null);
  const [error,       setError]       = useState('');

  // Sync orgId input if status loads after mount
  useState(() => {
    if (status?.orgId) setOrgId(String(status.orgId));
  });

  async function handleSave(onlyOrgId = false) {
    const parsedOrgId = orgId ? parseInt(orgId, 10) : undefined;
    if (orgId && (isNaN(parsedOrgId!) || parsedOrgId! <= 0)) {
      setError('Organization ID must be a positive integer (e.g. 12345).');
      return;
    }
    if (!onlyOrgId && !status?.configured && (!clientId || !clientSecret)) {
      setError('Client ID and Client Secret are required for first-time setup.');
      return;
    }
    setError(''); setSaving(true);
    try {
      const payload = onlyOrgId
        ? { client_id: '', client_secret: '', org_id: parsedOrgId }
        : { client_id: clientId, client_secret: clientSecret, org_id: parsedOrgId };
      // Backend treats empty strings as "keep existing" — only include non-empty credential fields
      await integrationsApi.saveSE({
        ...(payload.client_id  ? { client_id:     payload.client_id }     : {}),
        ...(payload.client_secret ? { client_secret: payload.client_secret } : {}),
        ...(parsedOrgId !== undefined ? { org_id: parsedOrgId } : {}),
      } as { client_id: string; client_secret: string; org_id?: number });
      setClientId(''); setClientSecret('');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null);
    try {
      const res = await integrationsApi.testSE();
      setTestResult({ ok: res.ok, message: res.ok ? `Connected — ${res.orgName}` : (res.error ?? 'Connection failed.') });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Test failed.' });
    } finally { setTesting(false); }
  }

  async function handleDisconnect() {
    if (!confirm('Clear SportsEngine credentials? Sync will stop working.')) return;
    await integrationsApi.deleteSE();
    onSaved();
  }

  return (
    <IntegrationCard
      title="SportsEngine"
      description="OAuth 2.0 client credentials used to sync tryout registrants and identify returning players. Read-only access only."
      configured={status?.configured ?? false}
      maskedValue={
        status?.maskedClientId
          ? `Client ID: ${status.maskedClientId}${status.orgId ? ` · Org ID: ${status.orgId}` : ' · Org ID: not set'}`
          : null
      }
    >
      <div className="flex flex-col gap-4 mt-4">
        <Input
          id="se-client-id"
          label="Client ID"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder={status?.configured ? '(leave blank to keep existing)' : 'SE client ID'}
          autoComplete="off"
        />
        <Input
          id="se-client-secret"
          label="Client Secret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={status?.configured ? '(leave blank to keep existing)' : 'SE client secret'}
          autoComplete="off"
        />
        <div className="flex flex-col gap-1.5">
          <Input
            id="se-org-id"
            label="Organization ID"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder="Integer e.g. 12345"
            autoComplete="off"
          />
          <p className="text-[11px] text-[#555]">
            Your SE integer org ID — find it in your SE HQ dashboard URL or API Settings.
            Stored once and used automatically for all API queries.
          </p>
        </div>

        {error && <p className="text-[13px] text-[#E07070]">{error}</p>}

        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="primary" size="sm" onClick={() => handleSave(false)} disabled={saving || (!clientId && !clientSecret)}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {status?.configured ? 'Update Credentials' : 'Save Credentials'}
          </Button>

          {/* Save org ID independently when credentials are already set */}
          {status?.configured && (
            <Button variant="outline" size="sm" onClick={() => handleSave(true)} disabled={saving || !orgId}>
              Save Org ID
            </Button>
          )}

          {status?.configured && (
            <>
              <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                {testing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Test Connection
              </Button>
              <Button variant="danger" size="sm" onClick={handleDisconnect}>
                <Unplug size={13} /> Disconnect
              </Button>
            </>
          )}
        </div>

        {testResult && (
          <div className={cn(
            'flex items-center gap-2 text-[13px] px-3 py-2 rounded-sm border',
            testResult.ok
              ? 'text-[#66C97A] bg-[#46B35A]/10 border-[#46B35A]/30'
              : 'text-[#E07070] bg-brand/10 border-brand/25',
          )}>
            {testResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {testResult.message}
          </div>
        )}
      </div>
    </IntegrationCard>
  );
}

// ─── SendGrid card ────────────────────────────────────────────────────────────

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-white/[0.06] rounded-sm p-4 space-y-3">
      <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#555]">{title}</div>
      {children}
    </div>
  );
}

type SectionResult = { ok: boolean; message: string } | null;

function ResultBadge({ result }: { result: SectionResult }) {
  if (!result) return null;
  return (
    <div className={cn(
      'flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-sm border',
      result.ok
        ? 'text-[#66C97A] bg-[#46B35A]/10 border-[#46B35A]/30'
        : 'text-[#E07070] bg-brand/10 border-brand/25',
    )}>
      {result.ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
      {result.message}
    </div>
  );
}

function SGCard({
  status,
  onSaved,
}: { status?: IntegrationStatus['sendgrid']; onSaved: () => void }) {
  const configured = status?.configured ?? false;

  // API Key section
  const [apiKey,      setApiKey]      = useState('');
  const [savingKey,   setSavingKey]   = useState(false);
  const [keyResult,   setKeyResult]   = useState<SectionResult>(null);

  // Sender Identity section
  const [senderName,  setSenderName]  = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [savingSender, setSavingSender] = useState(false);
  const [senderResult, setSenderResult] = useState<SectionResult>(null);

  // CC Email section
  const [ccEmail,     setCcEmail]     = useState(status?.ccEmail ?? '');
  const [savingCc,    setSavingCc]    = useState(false);
  const [ccResult,    setCcResult]    = useState<SectionResult>(null);

  // Test Email section
  const [testEmail,   setTestEmail]   = useState(status?.testEmail ?? '');
  const [savingTest,  setSavingTest]  = useState(false);
  const [testSaveResult, setTestSaveResult] = useState<SectionResult>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendTestResult, setSendTestResult] = useState<SectionResult>(null);

  async function handleSaveKey() {
    if (!apiKey && !configured) {
      setKeyResult({ ok: false, message: 'API key is required for initial setup.' });
      return;
    }
    if (!apiKey) { setKeyResult({ ok: false, message: 'Enter a new API key or leave blank (no change).' }); return; }
    setSavingKey(true); setKeyResult(null);
    try {
      await integrationsApi.saveSG({ api_key: apiKey });
      setApiKey('');
      setKeyResult({ ok: true, message: 'API key saved.' });
      onSaved();
    } catch (e) {
      setKeyResult({ ok: false, message: e instanceof Error ? e.message : 'Save failed.' });
    } finally { setSavingKey(false); }
  }

  async function handleSaveSender() {
    if (!configured && (!senderName || !senderEmail)) {
      setSenderResult({ ok: false, message: 'Sender name and email are required for initial setup.' });
      return;
    }
    setSavingSender(true); setSenderResult(null);
    try {
      await integrationsApi.saveSG({
        ...(senderName  ? { sender_name: senderName }   : {}),
        ...(senderEmail ? { sender_email: senderEmail } : {}),
      });
      setSenderResult({ ok: true, message: 'Sender identity saved.' });
      onSaved();
    } catch (e) {
      setSenderResult({ ok: false, message: e instanceof Error ? e.message : 'Save failed.' });
    } finally { setSavingSender(false); }
  }

  async function handleSaveCc() {
    setSavingCc(true); setCcResult(null);
    try {
      await integrationsApi.saveSG({ cc_email: ccEmail });
      setCcResult({ ok: true, message: ccEmail ? 'CC email saved.' : 'CC email cleared.' });
      onSaved();
    } catch (e) {
      setCcResult({ ok: false, message: e instanceof Error ? e.message : 'Save failed.' });
    } finally { setSavingCc(false); }
  }

  async function handleSaveTestEmail() {
    setSavingTest(true); setTestSaveResult(null);
    try {
      await integrationsApi.saveSG({ test_email: testEmail });
      setTestSaveResult({ ok: true, message: testEmail ? 'Test email address saved.' : 'Test email cleared — sending to real recipients.' });
      onSaved();
    } catch (e) {
      setTestSaveResult({ ok: false, message: e instanceof Error ? e.message : 'Save failed.' });
    } finally { setSavingTest(false); }
  }

  async function handleSendTest() {
    const addr = testEmail.trim() || status?.testEmail || '';
    if (!addr) {
      setSendTestResult({ ok: false, message: 'Enter a test address above or save one first.' });
      return;
    }
    setSendingTest(true); setSendTestResult(null);
    try {
      const res = await integrationsApi.testSG(addr);
      setSendTestResult({
        ok: res.ok,
        message: res.ok
          ? `Test email sent to ${addr}.`
          : (res.error ?? 'Test failed.'),
      });
    } catch (e) {
      setSendTestResult({ ok: false, message: e instanceof Error ? e.message : 'Test failed.' });
    } finally { setSendingTest(false); }
  }

  async function handleDisconnect() {
    if (!confirm('Clear SendGrid credentials? Email sending will stop.')) return;
    await integrationsApi.deleteSG();
    onSaved();
  }

  return (
    <IntegrationCard
      title="SendGrid"
      description="Transactional email delivery for offer letters, rejection notices, and acceptance confirmations."
      configured={configured}
      maskedValue={status?.maskedSenderEmail ? `Sender: ${status.maskedSenderEmail}` : null}
    >
      <div className="flex flex-col gap-3 mt-4">

        {/* API Credentials */}
        <SubSection title="API Credentials">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="sg-api-key"
                label="API Key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={configured ? '(leave blank to keep existing)' : 'SG.xxxxxxxxxx'}
                autoComplete="off"
              />
            </div>
            <Button variant="primary" size="sm" onClick={handleSaveKey} disabled={savingKey}>
              {savingKey ? <Loader2 size={13} className="animate-spin" /> : null}
              Save
            </Button>
          </div>
          <p className="text-[11px] text-[#555]">Leave blank to keep existing key.</p>
          <ResultBadge result={keyResult} />
        </SubSection>

        {/* Sender Identity */}
        <SubSection title="Sender Identity">
          <Input
            id="sg-sender-name"
            label="Sender Name"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Hamilton Jr Chargers"
          />
          <Input
            id="sg-sender-email"
            label="Sender Email"
            type="email"
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
            placeholder={status?.maskedSenderEmail ?? 'offers@jrchargersbaseball.com'}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-[#555]">Sender email must be verified in SendGrid.</p>
            <Button variant="primary" size="sm" onClick={handleSaveSender} disabled={savingSender}>
              {savingSender ? <Loader2 size={13} className="animate-spin" /> : null}
              Save
            </Button>
          </div>
          <ResultBadge result={senderResult} />
        </SubSection>

        {/* CC Email */}
        <SubSection title="CC Email (optional)">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="sg-cc-email"
                label="CC Email"
                type="email"
                value={ccEmail}
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="e.g. admin@jrchargersbaseball.com"
              />
            </div>
            <Button variant="primary" size="sm" onClick={handleSaveCc} disabled={savingCc}>
              {savingCc ? <Loader2 size={13} className="animate-spin" /> : null}
              Save
            </Button>
          </div>
          <p className="text-[11px] text-[#555]">Copied on all outgoing emails. Leave blank to clear.</p>
          <ResultBadge result={ccResult} />
        </SubSection>

        {/* Test Email Address */}
        <SubSection title="Test Email Address">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="sg-test-email"
                label="Test Email Address"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <Button variant="primary" size="sm" onClick={handleSaveTestEmail} disabled={savingTest}>
              {savingTest ? <Loader2 size={13} className="animate-spin" /> : null}
              Save
            </Button>
          </div>
          <p className="text-[11px] text-[#555]">
            Address all emails are redirected to when Test Mode is on. Safe to leave set — only active when the toggle is enabled.
          </p>
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={handleSendTest} disabled={sendingTest}>
              {sendingTest ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Send Test Email
            </Button>
          </div>
          <ResultBadge result={testSaveResult} />
          <ResultBadge result={sendTestResult} />
        </SubSection>

        {/* Disconnect */}
        {configured && (
          <div className="pt-1">
            <Button variant="danger" size="sm" onClick={handleDisconnect}>
              <Unplug size={13} /> Disconnect
            </Button>
          </div>
        )}
      </div>
    </IntegrationCard>
  );
}

// ─── Resend card ──────────────────────────────────────────────────────────────

function ResendCard({
  status,
  onSaved,
}: { status?: IntegrationStatus['resend']; onSaved: () => void }) {
  const configured = status?.configured ?? false;

  const [apiKey,       setApiKey]       = useState('');
  const [savingKey,    setSavingKey]    = useState(false);
  const [keyResult,    setKeyResult]    = useState<SectionResult>(null);

  const [senderName,   setSenderName]   = useState('');
  const [senderEmail,  setSenderEmail]  = useState('');
  const [savingSender, setSavingSender] = useState(false);
  const [senderResult, setSenderResult] = useState<SectionResult>(null);

  const [ccEmail,      setCcEmail]      = useState(status?.ccEmail ?? '');
  const [savingCc,     setSavingCc]     = useState(false);
  const [ccResult,     setCcResult]     = useState<SectionResult>(null);

  const [testEmail,    setTestEmail]    = useState(status?.testEmail ?? '');
  const [savingTest,   setSavingTest]   = useState(false);
  const [testSaveResult, setTestSaveResult] = useState<SectionResult>(null);
  const [sendingTest,  setSendingTest]  = useState(false);
  const [sendTestResult, setSendTestResult] = useState<SectionResult>(null);

  async function handleSaveKey() {
    if (!apiKey) { setKeyResult({ ok: false, message: 'Enter a Resend API key.' }); return; }
    setSavingKey(true); setKeyResult(null);
    try {
      await integrationsApi.saveRS({ api_key: apiKey });
      setApiKey('');
      setKeyResult({ ok: true, message: 'API key saved.' });
      onSaved();
    } catch (e) {
      setKeyResult({ ok: false, message: e instanceof Error ? e.message : 'Save failed.' });
    } finally { setSavingKey(false); }
  }

  async function handleSaveSender() {
    if (!configured && (!senderName || !senderEmail)) {
      setSenderResult({ ok: false, message: 'Sender name and email are required for initial setup.' });
      return;
    }
    setSavingSender(true); setSenderResult(null);
    try {
      await integrationsApi.saveRS({
        ...(senderName  ? { sender_name:  senderName }  : {}),
        ...(senderEmail ? { sender_email: senderEmail } : {}),
      });
      setSenderResult({ ok: true, message: 'Sender identity saved.' });
      onSaved();
    } catch (e) {
      setSenderResult({ ok: false, message: e instanceof Error ? e.message : 'Save failed.' });
    } finally { setSavingSender(false); }
  }

  async function handleSaveCc() {
    setSavingCc(true); setCcResult(null);
    try {
      await integrationsApi.saveRS({ cc_email: ccEmail });
      setCcResult({ ok: true, message: ccEmail ? 'CC email saved.' : 'CC email cleared.' });
      onSaved();
    } catch (e) {
      setCcResult({ ok: false, message: e instanceof Error ? e.message : 'Save failed.' });
    } finally { setSavingCc(false); }
  }

  async function handleSaveTestEmail() {
    setSavingTest(true); setTestSaveResult(null);
    try {
      await integrationsApi.saveRS({ test_email: testEmail });
      setTestSaveResult({ ok: true, message: testEmail ? 'Test email address saved.' : 'Test email cleared — sending to real recipients.' });
      onSaved();
    } catch (e) {
      setTestSaveResult({ ok: false, message: e instanceof Error ? e.message : 'Save failed.' });
    } finally { setSavingTest(false); }
  }

  async function handleSendTest() {
    const addr = testEmail.trim() || status?.testEmail || '';
    if (!addr) { setSendTestResult({ ok: false, message: 'Enter a test address above or save one first.' }); return; }
    setSendingTest(true); setSendTestResult(null);
    try {
      const res = await integrationsApi.testRS(addr);
      setSendTestResult({ ok: res.ok, message: res.ok ? `Test email sent to ${addr}.` : (res.error ?? 'Test failed.') });
    } catch (e) {
      setSendTestResult({ ok: false, message: e instanceof Error ? e.message : 'Test failed.' });
    } finally { setSendingTest(false); }
  }

  async function handleDisconnect() {
    if (!confirm('Clear Resend credentials? If Resend is the active provider, email sending will stop.')) return;
    await integrationsApi.deleteRS();
    onSaved();
  }

  return (
    <IntegrationCard
      title="Resend"
      description="Modern transactional email via Resend.com — a cost-effective, developer-friendly alternative to SendGrid."
      configured={configured}
      maskedValue={status?.maskedSenderEmail ? `Sender: ${status.maskedSenderEmail}` : null}
    >
      <div className="flex flex-col gap-3 mt-4">

        <div className="text-[11px] text-[#555] bg-white/[0.02] border border-white/[0.06] rounded-sm px-3 py-2">
          Get your API key at{' '}
          <span className="text-[#AAA] font-mono">resend.com/api-keys</span>.
          Your sender domain must be verified in the Resend dashboard before sending.
        </div>

        {/* API Credentials */}
        <SubSection title="API Credentials">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="rs-api-key"
                label="API Key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={configured ? '(leave blank to keep existing)' : 're_xxxxxxxxxx'}
                autoComplete="off"
              />
            </div>
            <Button variant="primary" size="sm" onClick={handleSaveKey} disabled={savingKey}>
              {savingKey ? <Loader2 size={13} className="animate-spin" /> : null}
              Save
            </Button>
          </div>
          <ResultBadge result={keyResult} />
        </SubSection>

        {/* Sender Identity */}
        <SubSection title="Sender Identity">
          <Input
            id="rs-sender-name"
            label="Sender Name"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Hamilton Jr Chargers"
          />
          <Input
            id="rs-sender-email"
            label="Sender Email"
            type="email"
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
            placeholder={status?.maskedSenderEmail ?? 'offers@jrchargersbaseball.com'}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-[#555]">Sender domain must be verified in Resend.</p>
            <Button variant="primary" size="sm" onClick={handleSaveSender} disabled={savingSender}>
              {savingSender ? <Loader2 size={13} className="animate-spin" /> : null}
              Save
            </Button>
          </div>
          <ResultBadge result={senderResult} />
        </SubSection>

        {/* CC Email */}
        <SubSection title="CC Email (optional)">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="rs-cc-email"
                label="CC Email"
                type="email"
                value={ccEmail}
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="e.g. admin@jrchargersbaseball.com"
              />
            </div>
            <Button variant="primary" size="sm" onClick={handleSaveCc} disabled={savingCc}>
              {savingCc ? <Loader2 size={13} className="animate-spin" /> : null}
              Save
            </Button>
          </div>
          <p className="text-[11px] text-[#555]">Copied on all outgoing emails. Leave blank to clear.</p>
          <ResultBadge result={ccResult} />
        </SubSection>

        {/* Test Email Address */}
        <SubSection title="Test Email Address">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="rs-test-email"
                label="Test Email Address"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <Button variant="primary" size="sm" onClick={handleSaveTestEmail} disabled={savingTest}>
              {savingTest ? <Loader2 size={13} className="animate-spin" /> : null}
              Save
            </Button>
          </div>
          <p className="text-[11px] text-[#555]">
            Address all emails are redirected to when Test Mode is on. Safe to leave set — only active when the toggle is enabled.
          </p>
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={handleSendTest} disabled={sendingTest}>
              {sendingTest ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Send Test Email
            </Button>
          </div>
          <ResultBadge result={testSaveResult} />
          <ResultBadge result={sendTestResult} />
        </SubSection>

        {/* Disconnect */}
        {configured && (
          <div className="pt-1">
            <Button variant="danger" size="sm" onClick={handleDisconnect}>
              <Unplug size={13} /> Disconnect
            </Button>
          </div>
        )}
      </div>
    </IntegrationCard>
  );
}

// ─── Shared card wrapper ──────────────────────────────────────────────────────

function IntegrationCard({
  title, description, configured, maskedValue, children,
}: {
  title: string; description: string;
  configured: boolean; maskedValue: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-bg-secondary border border-white/[0.08] rounded-md p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h3 className="font-display font-extrabold italic text-xl uppercase tracking-[0.04em]">{title}</h3>
        <span className={cn(
          'text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded border',
          configured
            ? 'text-[#66C97A] bg-[#46B35A]/10 border-[#46B35A]/30'
            : 'text-[#888] bg-white/[0.04] border-white/[0.08]',
        )}>
          {configured ? '● Connected' : '○ Not configured'}
        </span>
      </div>
      <p className="text-[13px] text-[#888] mb-2">{description}</p>
      {maskedValue && (
        <p className="text-[12px] text-[#555] font-mono mb-1">{maskedValue}</p>
      )}
      {children}
    </div>
  );
}
