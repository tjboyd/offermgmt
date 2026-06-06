import { useState, useEffect } from 'react';
import { Modal, Field } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { playersApi, teamsApi, type TeamRow } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function AddPlayerModal({ open, onClose, onCreated }: Props) {
  const [teams, setTeams]           = useState<TeamRow[]>([]);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  const [form, setForm] = useState({
    firstName: '', lastName: '', dateOfBirth: '', grade: '',
    parentName: '', parentEmail: '', teamId: '', notes: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({ firstName: '', lastName: '', dateOfBirth: '', grade: '', parentName: '', parentEmail: '', teamId: '', notes: '' });
    setError('');
    teamsApi.list().then((r) => {
      const active = r.teams.filter((t) => t.isActive);
      setTeams(active);
      // Always set teamId to first active team — use functional update so we
      // never read stale form state from the closure
      if (active.length > 0) {
        setForm((f) => ({ ...f, teamId: f.teamId || active[0].id }));
      }
    }).catch(() => {});
  }, [open]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.firstName && form.lastName && form.parentEmail && form.teamId;

  async function handleSubmit() {
    if (!valid) { setError('First name, last name, parent email, and team are required.'); return; }
    setError(''); setSaving(true);
    try {
      await playersApi.create({
        firstName:   form.firstName,
        lastName:    form.lastName,
        dateOfBirth: form.dateOfBirth || undefined,
        grade:       form.grade || undefined,
        parentName:  form.parentName || undefined,
        parentEmail: form.parentEmail,
        teamId:      form.teamId,
        notes:       form.notes || undefined,
      });
      onClose();
      // Call onCreated AFTER close so the parent re-renders cleanly before fetching
      setTimeout(() => onCreated(), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add player.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open} onClose={onClose} title="Add Player" width={520}
      footer={
        <>
          <span className="text-[12px] text-[#555]">New players are added as Draft. Send an offer to notify the family.</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={!valid || saving}>
              {saving ? 'Adding…' : 'Add to Roster'}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
          <Input label="Last Name"  value={form.lastName}  onChange={(e) => set('lastName',  e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date of Birth" type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
          <Input label="Grade" value={form.grade} onChange={(e) => set('grade', e.target.value)} placeholder="e.g. 6" />
        </div>
        <Field label="Team">
          <select
            className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none w-full focus:border-brand transition-colors"
            value={form.teamId}
            onChange={(e) => set('teamId', e.target.value)}
          >
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Input label="Parent / Guardian Name"  value={form.parentName}  onChange={(e) => set('parentName',  e.target.value)} />
        <Input label="Parent / Guardian Email" type="email" value={form.parentEmail} onChange={(e) => set('parentEmail', e.target.value)} placeholder="parent@email.com" required />
        <Field label="Coach Notes (private — never sent to parents)">
          <textarea
            className="bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none w-full focus:border-brand transition-colors resize-y min-h-[80px] font-mono text-[13px]"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Scouting notes, position, etc."
          />
        </Field>
        {error && <p className="text-[13px] text-[#E07070]">{error}</p>}
      </div>
    </Modal>
  );
}
