import { useState, useEffect, useCallback } from 'react';
import { Send, Ban, Copy, Check, ChevronLeft, ChevronRight, Loader2, Mail, ChevronDown, ChevronUp, FlaskConical, Star } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { offersApi, integrationsApi, playersApi, seasonsApi, teamsApi, divisionsApi, type PlayerRow, type SeasonRow, type RenderedEmail } from '@/lib/api';
import { cn } from '@/lib/utils';

interface EligibilityConcern {
  playerId: string;
  playerName: string;
  divisionName: string;
  reasons: string[];
}

export type ComposerMode = 'offer' | 'early_offer' | 'rejection';

interface Props {
  open:       boolean;
  onClose:    () => void;
  mode:       ComposerMode;
  initialIds: string[];
  onSent:     () => void;
}

const MODE_CONFIG = {
  offer:       { title: 'Send Offer Letters',     icon: Send, btnVariant: 'primary' as const, eligibleStatuses: ['draft','waitlisted','expired'], isOffer: true  },
  early_offer: { title: 'Send Offer Letters',     icon: Send, btnVariant: 'primary' as const, eligibleStatuses: ['draft','waitlisted','expired'], isOffer: true  },
  rejection:   { title: 'Send Rejection Letters', icon: Ban,  btnVariant: 'danger'  as const, eligibleStatuses: ['draft','waitlisted'],           isOffer: false },
};

// Maps offer template selection → backend apiMode value
const OFFER_TEMPLATE_API_MODE = {
  post_tryout: 'post_tryout' as const,
  early:       'early'       as const,
};

export function ComposerModal({ open, onClose, mode, initialIds, onSent }: Props) {
  const cfg = MODE_CONFIG[mode];

  const [allPlayers,   setAllPlayers]   = useState<PlayerRow[]>([]);
  const [selectedIds,  setSelectedIds]  = useState<string[]>(initialIds);
  const [previewIdx,   setPreviewIdx]   = useState(0);
  const [preview,      setPreview]      = useState<RenderedEmail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [season,       setSeason]       = useState<SeasonRow | null>(null);
  const [expiresAt,    setExpiresAt]    = useState('');
  const [sending,      setSending]      = useState(false);
  const [sendError,    setSendError]    = useState('');
  const [copied,       setCopied]       = useState(false);
  const [eligibilityConcerns, setEligibilityConcerns] = useState<EligibilityConcern[]>([]);
  const [eligibilityExpanded, setEligibilityExpanded] = useState(false);
  const [testMode,    setTestMode]    = useState(false);
  const [testAddress, setTestAddress] = useState<string | null>(null);
  // Offer template: 'post_tryout' = standard offer, 'early' = early offer
  const defaultOfferTemplate = mode === 'early_offer' ? 'early' : 'post_tryout';
  const [offerTemplate, setOfferTemplate] = useState<'post_tryout' | 'early'>(defaultOfferTemplate);

  // Load eligible players + active season on open
  useEffect(() => {
    if (!open) return;
    setSelectedIds(initialIds);
    setPreviewIdx(0);
    setPreview(null);
    setSendError('');
    setEligibilityConcerns([]);
    setEligibilityExpanded(false);
    setOfferTemplate(mode === 'early_offer' ? 'early' : 'post_tryout');

    // Fetch test mode status alongside player/season data
    integrationsApi.status().then((s) => {
      setTestMode(s.testMode ?? false);
      const provider = s.emailProvider ?? 'sendgrid';
      const addr = provider === 'sendgrid' ? s.sendgrid?.testEmail : s.resend?.testEmail;
      setTestAddress(addr ?? null);
    }).catch(() => { setTestMode(false); setTestAddress(null); });

    const isSinglePlayer = initialIds.length === 1;

    Promise.all([
      // Single-player mode: fetch all players so we can find the specific one regardless of status
      // Multi-player mode: only fetch eligible players for the bulk list
      playersApi.list({ perPage: '500' } as Record<string,string>),
      seasonsApi.list(),
      teamsApi.list(),
    ]).then(async ([pr, sr, tr]) => {
      if (isSinglePlayer) {
        // Lock to the single player; include them regardless of current status
        const target = pr.players.find((p) => p.id === initialIds[0]);
        setAllPlayers(target ? [target] : []);
        setSelectedIds(target ? [target.id] : []);
      } else {
        const filtered = pr.players.filter((p) => cfg.eligibleStatuses.includes(p.status));
        setAllPlayers(filtered);
      }

      const active = sr.seasons.find((s) => s.isActive);
      setSeason(active ?? null);
      if (active) {
        const def = new Date(Date.now() + active.offerExpiresDays * 86_400_000);
        setExpiresAt(def.toISOString().slice(0, 10));
      }

      // Eligibility checks only relevant in bulk mode
      if (!isSinglePlayer) {
        const filtered = pr.players.filter((p) => cfg.eligibleStatuses.includes(p.status));
        const teamsById = new Map(tr.teams.map((t) => [t.id, t]));
        const checksNeeded = filtered
          .filter((p) => {
            const team = p.teamId ? teamsById.get(p.teamId) : undefined;
            return team?.divisionId;
          })
          .map((p) => ({ player: p, team: teamsById.get(p.teamId!)! }));

        if (checksNeeded.length > 0) {
          const results = await Promise.allSettled(
            checksNeeded.map(({ player, team }) =>
              divisionsApi.checkEligibility(team.divisionId!, player.id).then((res) => ({ player, team, res }))
            )
          );
          const concerns: EligibilityConcern[] = [];
          for (const r of results) {
            if (r.status === 'fulfilled' && !r.value.res.eligible) {
              concerns.push({
                playerId:    r.value.player.id,
                playerName:  `${r.value.player.firstName} ${r.value.player.lastName}`,
                divisionName: r.value.team.name,
                reasons:     r.value.res.reasons,
              });
            }
          }
          setEligibilityConcerns(concerns);
        }
      }
    }).catch(console.error);
  }, [open, mode, initialIds.join(',')]);

  // Load preview whenever selected player or expiresAt changes
  const currentPlayerId = selectedIds[previewIdx] ?? selectedIds[0];

  // The active apiMode: for offer types use the selected template; for rejection use 'rejection'
  const activeApiMode = cfg.isOffer ? OFFER_TEMPLATE_API_MODE[offerTemplate] : 'rejection';

  const loadPreview = useCallback(async () => {
    if (!currentPlayerId || !season) return;
    setPreviewLoading(true);
    try {
      const exp = expiresAt ? new Date(expiresAt + 'T23:59:59Z').toISOString() : undefined;
      const res = await offersApi.render({
        playerId:  currentPlayerId,
        mode:      activeApiMode,
        seasonId:  season.id,
        expiresAt: exp,
      });
      setPreview(res.rendered);
    } catch (e) {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [currentPlayerId, season?.id, expiresAt, activeApiMode]);

  useEffect(() => { if (open) loadPreview(); }, [open, currentPlayerId, expiresAt, offerTemplate, loadPreview]);

  function toggle(id: string) {
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  async function handleCopy() {
    if (!preview) return;
    const text = `Subject: ${preview.subject}\n\n${preview.bodyText}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);

    // Record as manual copy
    if (currentPlayerId && season) {
      const exp = expiresAt ? new Date(expiresAt + 'T23:59:59Z').toISOString() : undefined;
      try {
        await offersApi.send({ playerIds: [currentPlayerId], mode: activeApiMode, seasonId: season.id, expiresAt: exp, sendMethod: 'manual_copy', resend: initialIds.length === 1 });
        onSent();
      } catch { /* non-fatal */ }
    }
  }

  async function handleSend() {
    if (selectedIds.length === 0 || !season) return;
    setSending(true); setSendError('');
    const exp = expiresAt ? new Date(expiresAt + 'T23:59:59Z').toISOString() : undefined;
    try {
      await offersApi.send({ playerIds: selectedIds, mode: activeApiMode, seasonId: season.id, expiresAt: exp, sendMethod: 'sendgrid', resend: initialIds.length === 1 });
      onSent();
      onClose();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  const selectedPlayers = allPlayers.filter((p) => selectedIds.includes(p.id));

  return (
    <Modal
      open={open} onClose={onClose} title={cfg.title} width={1050}
      footer={
        <>
          <div className="text-[12px] text-[#666]">
            {selectedIds.length === 0
              ? 'Select at least one player'
              : `${selectedIds.length} email${selectedIds.length > 1 ? 's' : ''} ready`}
            {sendError && <span className="text-[#E07070] ml-2">{sendError}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            {currentPlayerId && (
              <Button variant="outline" size="md" onClick={handleCopy} disabled={!preview}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy Email'}
              </Button>
            )}
            <Button
              variant={cfg.btnVariant}
              onClick={handleSend}
              disabled={selectedIds.length === 0 || sending}
            >
              {sending
                ? <Loader2 size={14} className="animate-spin" />
                : <cfg.icon size={14} />}
              {sending
                ? 'Sending…'
                : mode === 'rejection'
                ? `Send ${selectedIds.length || ''} Rejection${selectedIds.length !== 1 ? 's' : ''}`
                : offerTemplate === 'early'
                ? `Send ${selectedIds.length || ''} Early Offer${selectedIds.length !== 1 ? 's' : ''}`
                : `Send ${selectedIds.length || ''} Offer${selectedIds.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </>
      }
    >
      {eligibilityConcerns.length > 0 && (
        <div className="mb-4 px-3 py-2.5 bg-[#E5A567]/[0.06] border border-[#E5A567]/20 rounded-sm text-[12px] text-[#E5A567]">
          <button
            className="w-full flex items-center justify-between gap-2 text-left"
            onClick={() => setEligibilityExpanded((v) => !v)}
          >
            <span className="font-semibold">
              ⚠️ {eligibilityConcerns.length} player{eligibilityConcerns.length !== 1 ? 's' : ''} may have eligibility concerns. Review before sending.
            </span>
            {eligibilityExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {eligibilityExpanded && (
            <ul className="mt-2 flex flex-col gap-1.5 pl-1">
              {eligibilityConcerns.map((c) => (
                <li key={c.playerId} className="text-[#E5A567]/80">
                  <span className="font-medium text-[#E5A567]">{c.playerName}</span>
                  {' — '}
                  {c.divisionName}: {c.reasons.join(', ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {testMode && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-[#C8A22A]/[0.06] border border-[#C8A22A]/25 rounded-sm text-[12px] text-[#C8A22A]">
          <FlaskConical size={13} className="shrink-0" />
          <span>
            <strong>Test mode on</strong> — emails will be delivered to{' '}
            <span className="font-mono">{testAddress}</span> instead of the player's family.
          </span>
        </div>
      )}

      <div className="grid gap-6 min-h-[480px]" style={{ gridTemplateColumns: '280px 1fr' }}>
        {/* Left: recipient list + deadline */}
        <div className="flex flex-col gap-4">
          {/* Offer template picker — only for offer types */}
          {cfg.isOffer && (
            <div>
              <label className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888] block mb-2">
                Offer Template
              </label>
              <div className="flex gap-1.5">
                {([
                  { value: 'post_tryout', label: 'Standard Offer' },
                  { value: 'early',       label: 'Early Offer'    },
                ] as const).map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setOfferTemplate(t.value)}
                    className={cn(
                      'flex-1 py-1.5 text-[12px] font-semibold rounded-sm border transition-all',
                      offerTemplate === t.value
                        ? 'border-brand bg-brand/10 text-white'
                        : 'border-white/[0.08] text-[#555] hover:text-[#AAA] hover:border-white/20',
                    )}
                  >
                    {t.value === 'early' && <Star size={10} className="inline mr-1 mb-px text-[#C8A22A]" />}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {initialIds.length === 1 ? (
            /* Single-player mode — locked recipient, no list */
            <div>
              <label className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888] block mb-2">
                Recipient
              </label>
              {allPlayers[0] ? (
                <div className="px-3 py-2.5 bg-brand/[0.08] border border-brand/25 rounded-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold">{allPlayers[0].firstName} {allPlayers[0].lastName}</span>
                    {allPlayers[0].earlyOfferEligible && (
                      <span title="Early offer eligible"><Star size={10} className="text-[#C8A22A]" /></span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#555] mt-0.5">{allPlayers[0].parentEmail}</div>
                </div>
              ) : (
                <p className="text-[12px] text-[#555] p-3">Loading player…</p>
              )}
            </div>
          ) : (
            /* Multi-player mode — selectable list */
            <div>
              <label className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888] block mb-2">
                Recipients ({selectedIds.length})
              </label>
              <div className="scroll max-h-[300px] flex flex-col gap-1 p-2 bg-bg-primary border border-white/[0.08] rounded-sm">
                {allPlayers.length === 0 ? (
                  <p className="text-[12px] text-[#555] p-3 text-center">No eligible players</p>
                ) : allPlayers.map((p) => (
                  <label
                    key={p.id}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer border transition-colors',
                      selectedIds.includes(p.id)
                        ? 'bg-brand/[0.12] border-brand/35'
                        : 'border-transparent hover:bg-white/[0.03]',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-brand flex-shrink-0"
                      checked={selectedIds.includes(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold truncate">{p.firstName} {p.lastName}</span>
                        {p.earlyOfferEligible && (
                          <span title="Early offer eligible">
                            <Star size={10} className="text-[#C8A22A] shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#555] truncate">{p.parentEmail}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {mode !== 'rejection' && (
            <div>
              <label className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888] block mb-1.5">
                Acceptance Deadline
              </label>
              <input
                type="date"
                className="bg-[#1A1A1A] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none w-full focus:border-brand transition-colors"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          )}

          <div className="bg-[#1A1A1A] border border-white/[0.06] rounded-sm p-3">
            <div className="text-[11px] font-bold text-white mb-1">
              {mode === 'rejection'
                ? 'Rejection Template'
                : offerTemplate === 'early'
                ? 'Early Offer Template'
                : 'Standard Offer Template'}
            </div>
            <div className="text-[11px] text-[#555]">Edit in Settings → Email Templates</div>
          </div>
        </div>

        {/* Right: email preview */}
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-brand">Preview</span>
            {selectedPlayers.length > 1 && (
              <div className="flex items-center gap-1.5 text-[12px] text-[#888]">
                <button
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06] disabled:opacity-30 transition-colors"
                  onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))}
                  disabled={previewIdx === 0}
                >
                  <ChevronLeft size={13} />
                </button>
                <span>{previewIdx + 1} / {selectedPlayers.length}</span>
                <button
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06] disabled:opacity-30 transition-colors"
                  onClick={() => setPreviewIdx((i) => Math.min(selectedPlayers.length - 1, i + 1))}
                  disabled={previewIdx === selectedPlayers.length - 1}
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            )}
          </div>

          {/* To / Subject header */}
          <div className="bg-[#0F0F0F] border border-white/[0.08] rounded-sm p-3 text-[13px]">
            <div className="flex gap-3 items-baseline mb-2">
              <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#555] w-14">To</span>
              <span className="text-white">
                {selectedPlayers[previewIdx]
                  ? `${selectedPlayers[previewIdx].parentName ?? ''} <${selectedPlayers[previewIdx].parentEmail}>`
                  : <span className="text-[#444]">— select recipient —</span>}
              </span>
            </div>
            <div className="flex gap-3 items-baseline">
              <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#555] w-14">Subject</span>
              <span className="text-white">{preview?.subject ?? '—'}</span>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {previewLoading ? (
              <div className="flex items-center justify-center h-32 text-[#555]">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading preview…
              </div>
            ) : preview ? (
              <EmailPreview html={preview.bodyHtml} />
            ) : selectedIds.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-[#555] gap-2">
                <Mail size={24} className="text-[#333]" />
                <span className="text-[13px]">Select recipients to preview</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function EmailPreview({ html }: { html: string }) {
  return (
    <div className="bg-white rounded-sm overflow-hidden">
      <div className="h-1.5 bg-[#AD0303]" />
      <div
        className="p-6 text-[#111] text-[14px] leading-relaxed font-sans"
        style={{ fontFamily: 'Arial, sans-serif' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <div className="px-6 pb-4 text-[11px] text-[#999] border-t border-[#eee] pt-3 mt-2">
        Hamilton Jr Chargers Baseball · Hamilton, ON · jrchargersbaseball.com
      </div>
    </div>
  );
}
