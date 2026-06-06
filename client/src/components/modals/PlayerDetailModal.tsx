import { useState, useEffect } from 'react';
import {
  Plus, Send, Eye, CheckCircle, XCircle, Clock,
  Edit2, Trash2, RefreshCw, Ban,
} from 'lucide-react';
import { Modal, Field } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/Badge';
import { playersApi, teamsApi, seasonsApi, divisionsApi, type PlayerRow, type OfferRow, type ActivityItem, type TeamRow, type EligibilityResult } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { fmtDate, fmtDateTime, fmtBirthDate, initials, cn } from '@/lib/utils';

interface Props {
  open:     boolean;
  playerId: string | null;
  onClose:  () => void;
  onRefresh: () => void;
  onOpenComposer: (mode: 'offer' | 'early_offer' | 'rejection', playerIds: string[]) => void;
}

const TIMELINE_ICONS: Record<string, React.ReactNode> = {
  player_added:           <Plus size={12} />,
  offer_sent:             <Send size={12} />,
  offer_resent:           <Send size={12} />,
  rejection_sent:         <Ban size={12} />,
  email_opened:           <Eye size={12} />,
  landing_page_viewed:    <Eye size={12} />,
  offer_accepted:         <CheckCircle size={12} />,
  offer_declined:         <XCircle size={12} />,
  offer_expired:          <Clock size={12} />,
  returning_flag_set:     <Plus size={12} />,
  early_offer_eligible_set: <Plus size={12} />,
  status_changed:         <RefreshCw size={12} />,
  note_added:             <Edit2 size={12} />,
  note_edited:            <Edit2 size={12} />,
};

export function PlayerDetailModal({ open, playerId, onClose, onRefresh, onOpenComposer }: Props) {
  const { user }                        = useAuth();
  const [player, setPlayer]             = useState<PlayerRow | null>(null);
  const [offers, setOffers]             = useState<OfferRow[]>([]);
  const [activity, setActivity]         = useState<ActivityItem[]>([]);
  const [teams, setTeams]               = useState<TeamRow[]>([]);
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);
  const [editing, setEditing]           = useState(false);
  const [draft, setDraft]               = useState<Partial<PlayerRow>>({});
  const [saving, setSaving]             = useState(false);
  const [notesText, setNotesText]       = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [eligibility, setEligibility]   = useState<(EligibilityResult & { divisionName: string }) | null>(null);

  const isAdmin     = user?.role === 'admin' || user?.role === 'board';
  const isHeadCoach = user?.role === 'head_coach';
  const canSend     = isAdmin || isHeadCoach;
  const canEdit     = isAdmin || isHeadCoach;

  useEffect(() => {
    if (!open || !playerId) return;
    setEditing(false); setEditingNotes(false);
    setEligibility(null);
    setLoading(true);
    Promise.all([
      playersApi.get(playerId),
      teamsApi.list(),
      seasonsApi.list(),
    ]).then(([detail, teamsRes, seasonsRes]) => {
      setPlayer(detail.player);
      setOffers(detail.offers);
      setActivity(detail.activity);
      setNotesText(detail.player.notes ?? '');
      const activeSeason = seasonsRes.seasons.find((s) => s.isActive);
      setActiveSeasonId(activeSeason?.id ?? null);
      const activeTeams = teamsRes.teams.filter((t) => t.isActive);
      setTeams(activeTeams);

      // Eligibility check: if the player has a team with a divisionId
      const playerTeam = activeTeams.find((t) => t.id === detail.player.teamId);
      if (playerTeam?.divisionId) {
        divisionsApi.checkEligibility(playerTeam.divisionId, detail.player.id)
          .then((result) => {
            if (!result.eligible) {
              setEligibility({ ...result, divisionName: playerTeam.name });
            }
          })
          .catch(() => { /* non-fatal */ });
      }
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, [open, playerId]);

  if (!open || !playerId) return null;

  const latestOffer = offers[offers.length - 1] ?? null;

  async function handleDelete() {
    if (!player || !confirm(`Remove ${player.firstName} ${player.lastName} from the system?`)) return;
    await playersApi.delete(player.id);
    onRefresh(); onClose();
  }

  async function handleSaveEdit() {
    if (!player) return;
    setSaving(true);
    try {
      // Strip null values — API input type uses undefined, not null
      const patch = Object.fromEntries(
        Object.entries(draft).filter(([, v]) => v !== null),
      ) as Parameters<typeof playersApi.update>[1];
      await playersApi.update(player.id, patch);
      const updated = await playersApi.get(player.id);
      setPlayer(updated.player);
      setEditing(false); setDraft({});
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleSaveNotes() {
    if (!player) return;
    await playersApi.updateNotes(player.id, notesText);
    const updated = await playersApi.get(player.id);
    setPlayer(updated.player);
    setEditingNotes(false);
  }

  async function handleSetReturning(value: boolean) {
    if (!player) return;
    await playersApi.setReturning(player.id, value);
    const updated = await playersApi.get(player.id);
    setPlayer(updated.player); onRefresh();
  }

  async function handleSetEarlyOffer(value: boolean) {
    if (!player) return;
    try {
      await playersApi.setEarlyOffer(player.id, value);
      const updated = await playersApi.get(player.id);
      setPlayer(updated.player); onRefresh();
    } catch (e) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  async function handleStatusChange(status: string) {
    if (!player) return;
    await playersApi.setStatus(player.id, status);
    const updated = await playersApi.get(player.id);
    setPlayer(updated.player); onRefresh();
  }

  return (
    <Modal
      open={open} onClose={onClose} width={760}
      title={player ? `${player.firstName} ${player.lastName}` : 'Player Detail'}
      footer={player ? (
        <>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={handleDelete}>
              <Trash2 size={13} /> Remove
            </Button>
          )}
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button variant="ghost" onClick={() => { setEditing(false); setDraft({}); }}>Cancel</Button>
                <Button variant="primary" onClick={handleSaveEdit} disabled={saving}>Save Changes</Button>
              </>
            ) : (
              <>
                {canSend && ['draft','waitlisted'].includes(player.status) && (
                  <Button variant="danger" size="md" onClick={() => { onOpenComposer('rejection', [player.id]); onClose(); }}>
                    <Ban size={13} /> Send Rejection
                  </Button>
                )}
                {canSend && ['draft','waitlisted','expired'].includes(player.status) && (
                  <Button variant="primary" onClick={() => {
                    const mode = player.earlyOfferEligible ? 'early_offer' : 'offer';
                    onOpenComposer(mode, [player.id]); onClose();
                  }}>
                    <Send size={13} /> Send Offer
                  </Button>
                )}
                {canSend && player.status === 'sent' && (
                  <Button variant="outline" onClick={() => { onOpenComposer('offer', [player.id]); onClose(); }}>
                    <RefreshCw size={13} /> Resend Offer
                  </Button>
                )}
              </>
            )}
          </div>
        </>
      ) : undefined}
    >
      {loading || !player ? (
        <div className="flex items-center justify-center h-48 text-[#555]">Loading…</div>
      ) : (
        <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1.2fr' }}>
          {/* Left: Player info */}
          <div className="flex flex-col gap-4">
            {/* Avatar + status */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#242424] flex items-center justify-center font-display font-extrabold italic text-lg text-white flex-shrink-0">
                {initials(player.firstName, player.lastName)}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge status={player.status} />
                  {player.isReturning && (
                    <span className="text-[9px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 rounded bg-[#6BAEFF]/10 text-[#6BAEFF] border border-[#6BAEFF]/25">
                      Returning
                    </span>
                  )}
                  {player.earlyOfferEligible && (
                    <span className="text-[9px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 rounded bg-brand/10 text-[#E07070] border border-brand/25">
                      Early Offer
                    </span>
                  )}
                </div>
                <div className="text-[13px] text-[#888]">
                  {teams.find((t) => t.id === player.teamId)?.name ?? '—'}
                  {player.dateOfBirth ? ` · Born ${fmtBirthDate(player.dateOfBirth)}` : player.ageOverride ? ` · Age ${player.ageOverride}` : ''}
                  {player.grade ? ` · Grade ${player.grade}` : ''}
                </div>
              </div>
            </div>

            {/* Info card or edit form */}
            {editing ? (
              <EditForm draft={draft} setDraft={setDraft} teams={teams} player={player} />
            ) : (
              <div className="bg-bg-surface border border-white/[0.08] rounded-sm p-4 flex flex-col gap-3">
                <InfoRow label="Parent / Guardian" value={player.parentName ?? '—'} />
                <InfoRow label="Email" value={
                  <a href={`mailto:${player.parentEmail}`} className="text-brand hover:underline">{player.parentEmail}</a>
                } />
                <InfoRow label="Added" value={fmtDate(player.createdAt)} />
                {latestOffer?.expiresAt && <InfoRow label="Offer Expires" value={fmtDate(latestOffer.expiresAt)} />}
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => { setDraft({ ...player }); setEditing(true); }} className="self-start mt-1">
                    <Edit2 size={12} /> Edit details
                  </Button>
                )}
              </div>
            )}

            {/* Flags */}
            <div className="flex flex-col gap-2">
              <FlagToggle
                label="Returning Player"
                value={player.isReturning}
                source={player.returningSource}
                onChange={handleSetReturning}
              />
              {(isAdmin || isHeadCoach) && (
                <FlagToggle
                  label="Early Offer Eligible"
                  value={player.earlyOfferEligible}
                  disabled={!player.isReturning}
                  disabledReason="Player must be marked Returning first"
                  onChange={handleSetEarlyOffer}
                />
              )}
            </div>

            {/* Eligibility warning */}
            {eligibility && (
              <div className="px-3 py-2.5 bg-[#E5A567]/[0.06] border border-[#E5A567]/20 rounded-sm text-[12px] text-[#E5A567]">
                <div className="font-semibold mb-0.5">⚠️ Eligibility concern</div>
                <div className="text-[#E5A567]/80">
                  This player may not meet the requirements for {eligibility.divisionName}: {eligibility.reasons.join(', ')}
                </div>
              </div>
            )}

            {/* Team assignment */}
            {canEdit && (() => {
              const seasonTeams = activeSeasonId
                ? teams.filter((t) => t.seasonId === activeSeasonId)
                : teams;
              return seasonTeams.length > 0 ? (
                <Field label="Team">
                  <select
                    className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none w-full focus:border-brand"
                    value={player.teamId ?? ''}
                    onChange={async (e) => {
                      const val = e.target.value || null;
                      await playersApi.update(player.id, { teamId: val } as Parameters<typeof playersApi.update>[1]);
                      const updated = await playersApi.get(player.id);
                      setPlayer(updated.player); onRefresh();
                    }}
                  >
                    <option value="">— No team —</option>
                    {seasonTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
              ) : null;
            })()}

            {/* Status override */}
            {canEdit && (
              <Field label="Change Status">
                <select
                  className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none w-full focus:border-brand"
                  value={player.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                >
                  {(['draft','sent','accepted','declined','expired','waitlisted','rejected'] as const).map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </Field>
            )}

            {/* Coach notes */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888]">
                  Coach Notes <span className="text-[#444] normal-case font-normal">(private)</span>
                </label>
                {!editingNotes && (
                  <button onClick={() => setEditingNotes(true)} className="text-[11px] text-[#555] hover:text-white transition-colors">
                    <Edit2 size={11} className="inline mr-1" />Edit
                  </button>
                )}
              </div>
              {editingNotes ? (
                <>
                  <textarea
                    className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-[13px] font-mono outline-none w-full focus:border-brand resize-y min-h-[80px]"
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingNotes(false); setNotesText(player.notes ?? ''); }}>Cancel</Button>
                    <Button variant="primary" size="sm" onClick={handleSaveNotes}>Save Notes</Button>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-[#AAA] leading-relaxed italic">
                  {player.notes || 'No notes added'}
                </p>
              )}
            </div>
          </div>

          {/* Right: Offer timeline */}
          <div className="flex flex-col gap-3">
            <h3 className="font-display font-extrabold italic text-[18px] uppercase tracking-[0.04em]">Offer Timeline</h3>
            {activity.length === 0 ? (
              <p className="text-[#555] text-[13px]">No offer sent yet. Send an offer to start tracking opens, clicks, and acceptance.</p>
            ) : (
              <div className="flex flex-col relative pl-1">
                {activity.map((item, i) => {
                  const isHot = ['offer_accepted', 'offer_sent'].includes(item.eventType);
                  const isMuted = ['player_added', 'offer_expired', 'status_changed'].includes(item.eventType);
                  return (
                    <div key={item.id} className="flex gap-3.5 pb-4 relative">
                      {i < activity.length - 1 && (
                        <div className="absolute left-3.5 top-6 bottom-0 w-px bg-white/[0.06]" />
                      )}
                      <div className={cn(
                        'w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center border',
                        isHot
                          ? 'bg-brand border-brand text-white'
                          : isMuted
                          ? 'bg-[#1A1A1A] border-white/[0.08] text-[#555]'
                          : 'bg-brand/[0.18] border-brand/40 text-brand',
                      )}>
                        {TIMELINE_ICONS[item.eventType] ?? <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                      </div>
                      <div className="flex-1 pt-1">
                        <div className="text-[13px] font-semibold text-white leading-tight">
                          {formatEventLabel(item.eventType, item.actorLabel)}
                        </div>
                        <div className="text-[11px] text-[#555] mt-0.5">{fmtDateTime(item.ts)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {latestOffer?.expiresAt && player.status === 'sent' && (
              <div className="mt-auto px-3 py-2 bg-[#E5A567]/[0.06] border border-[#E5A567]/20 rounded-sm text-[12px] text-[#E5A567]">
                <strong>Awaiting response.</strong> Offer expires {fmtDate(latestOffer.expiresAt)}.
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[13px]">
      <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#666] shrink-0">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function FlagToggle({
  label, value, source, onChange, disabled, disabledReason,
}: {
  label: string; value: boolean; source?: string | null;
  onChange: (v: boolean) => void; disabled?: boolean; disabledReason?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', disabled && 'opacity-40')}>
      <div>
        <span className="text-[13px] text-[#AAA]">{label}</span>
        {source && <span className="text-[10px] text-[#555] ml-2">({source === 'se_match' ? 'from SE' : 'manual'})</span>}
        {disabled && disabledReason && <p className="text-[10px] text-[#555]">{disabledReason}</p>}
      </div>
      <button
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={cn(
          'w-10 h-5 rounded-full transition-colors duration-200 relative flex-shrink-0',
          value ? 'bg-brand' : 'bg-[#333]',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span className={cn(
          'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-sm',
          value ? 'left-5' : 'left-0.5',
        )} />
      </button>
    </div>
  );
}

function EditForm({
  draft, setDraft, teams, player,
}: {
  draft: Partial<PlayerRow>;
  setDraft: (d: Partial<PlayerRow>) => void;
  teams: TeamRow[];
  player: PlayerRow;
}) {
  const set = (k: keyof PlayerRow, v: string) => setDraft({ ...draft, [k]: v || undefined });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Input label="First" value={draft.firstName ?? ''} onChange={(e) => set('firstName', e.target.value)} />
        <Input label="Last"  value={draft.lastName  ?? ''} onChange={(e) => set('lastName',  e.target.value)} />
      </div>
      <Input label="Date of Birth" type="date" value={draft.dateOfBirth ?? ''} onChange={(e) => set('dateOfBirth', e.target.value)} />
      <Input label="Grade" value={draft.grade ?? ''} onChange={(e) => set('grade', e.target.value)} />
      <Field label="Team">
        <select
          className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none w-full focus:border-brand"
          value={(draft.teamId ?? player.teamId) ?? ''}
          onChange={(e) => setDraft({ ...draft, teamId: e.target.value })}
        >
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <Input label="Parent Name"  value={draft.parentName  ?? ''} onChange={(e) => set('parentName',  e.target.value)} />
      <Input label="Parent Email" value={draft.parentEmail ?? ''} onChange={(e) => set('parentEmail', e.target.value)} type="email" />
    </div>
  );
}

function formatEventLabel(eventType: string, _actorLabel: string): string {
  const map: Record<string, string> = {
    player_added:               'Added to roster',
    offer_sent:                 'Offer email sent',
    offer_resent:               'Offer email resent',
    rejection_sent:             'Rejection email sent',
    email_opened:               'Email opened',
    landing_page_viewed:        'Acceptance page viewed',
    offer_accepted:             'Offer accepted',
    offer_declined:             'Offer declined',
    offer_expired:              'Offer expired',
    se_redirected:              'Redirected to SportsEngine',
    confirmation_email_sent:    'Confirmation email sent',
    returning_flag_set:         'Marked as returning player',
    returning_flag_cleared:     'Returning flag cleared',
    early_offer_eligible_set:   'Marked early offer eligible',
    early_offer_eligible_cleared: 'Early offer eligibility cleared',
    status_changed:             'Status changed',
    note_added:                 'Coach note added',
    note_edited:                'Coach note edited',
    player_edited:              'Player info updated',
    player_removed:             'Player removed',
  };
  return map[eventType] ?? eventType;
}
