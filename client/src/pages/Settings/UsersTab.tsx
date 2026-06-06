import { useState, useEffect, useCallback } from 'react';
import { UserPlus, MoreHorizontal, RefreshCw, Trash2, ShieldOff, ShieldCheck, KeyRound, Mail, Upload } from 'lucide-react';
import { CsvImportUsersModal } from '@/components/modals/CsvImportUsersModal';
import {
  usersApi, teamsApi,
  type UserRow, type InviteInput, type TeamRow,
} from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = {
  admin:           'Admin',
  board:           'Board',
  head_coach:      'Head Coach',
  assistant_coach: 'Asst Coach',
};

const STATUS_COLORS: Record<string, string> = {
  active:   'text-green-400',
  pending:  'text-yellow-400',
  inactive: 'text-[#555]',
};

function userStatus(u: UserRow) {
  if (!u.isActive)      return 'inactive';
  if (!u.emailVerified) return 'pending';
  return 'active';
}

// ─── Invite / Edit Modal ──────────────────────────────────────────────────────

interface UserFormProps {
  initial?: UserRow | null;
  teams: TeamRow[];
  currentUserRole: string;
  onSave: (data: InviteInput) => Promise<void>;
  onClose: () => void;
}

function UserForm({ initial, teams, currentUserRole, onSave, onClose }: UserFormProps) {
  const [form, setForm] = useState<InviteInput>({
    email:    initial?.email    ?? '',
    fullName: initial?.fullName ?? '',
    role:     initial?.role     ?? 'head_coach',
    teamIds:  initial?.teamIds  ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const isCoachRole = form.role === 'head_coach' || form.role === 'assistant_coach';

  const visibleRoles = ['board', 'head_coach', 'assistant_coach'];
  if (currentUserRole === 'admin') visibleRoles.unshift('admin');

  function toggleTeam(id: string) {
    setForm((f) => ({
      ...f,
      teamIds: f.teamIds?.includes(id)
        ? f.teamIds.filter((t) => t !== id)
        : [...(f.teamIds ?? []), id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to save user.');
      setSaving(false);
    }
  }

  const activeTeams = teams.filter((t) => t.isActive);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1A1A1A] border border-white/[0.08] rounded-md w-full max-w-md">
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <h2 className="font-display font-extrabold italic text-[22px] uppercase">
            {initial ? 'Edit User' : 'Invite User'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <Input
            label="Full Name"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            required
          />
          {!initial && (
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          )}
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => setForm((f) => ({
              ...f,
              role: e.target.value as InviteInput['role'],
              teamIds: [],
            }))}
          >
            {visibleRoles.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </Select>

          {isCoachRole && activeTeams.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888]">Team Assignments</div>
              <div className="space-y-1">
                {activeTeams.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 cursor-pointer text-sm text-[#CCC] hover:text-white">
                    <input
                      type="checkbox"
                      checked={form.teamIds?.includes(t.id) ?? false}
                      onChange={() => toggleTeam(t.id)}
                      className="accent-brand"
                    />
                    {t.name}{t.division ? ` — ${t.division}` : ''}
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-[12px] text-[#E07070]">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Send Invite'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  title: string;
  message: string;
  danger?: boolean;
  phrase?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

function ConfirmDialog({ title, message, danger, phrase, onConfirm, onClose }: ConfirmDialogProps) {
  const [typed, setTyped]   = useState('');
  const [busy,  setBusy]    = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const ok = !phrase || typed === phrase;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Action failed.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1A1A1A] border border-white/[0.08] rounded-md w-full max-w-sm p-6 space-y-4">
        <h2 className="font-display font-extrabold italic text-[20px] uppercase">{title}</h2>
        <p className="text-[13px] text-[#AAA]">{message}</p>
        {phrase && (
          <Input
            label={`Type "${phrase}" to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
          />
        )}
        {error && <p className="text-[12px] text-[#E07070]">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'outline-red' : 'primary'} disabled={!ok || busy} onClick={go}>
            {busy ? 'Working…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Row actions menu ─────────────────────────────────────────────────────────

type Action = 'edit' | 'resend' | 'reset' | 'deactivate' | 'reactivate' | 'delete';

interface ActionsMenuProps {
  user: UserRow;
  currentUserId: string;
  onAction: (a: Action) => void;
}

function ActionsMenu({ user, currentUserId, onAction }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const isSelf  = user.id === currentUserId;
  const status  = userStatus(user);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded hover:bg-white/[0.06] text-[#666] hover:text-white transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 w-44 bg-[#252525] border border-white/[0.10] rounded-sm shadow-xl overflow-hidden text-[13px]">
            <button className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-[#CCC]" onClick={() => { setOpen(false); onAction('edit'); }}>Edit</button>
            {status === 'pending' && (
              <button className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-[#CCC] flex items-center gap-2" onClick={() => { setOpen(false); onAction('resend'); }}>
                <Mail size={13} />Resend invite
              </button>
            )}
            {status === 'active' && (
              <button className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-[#CCC] flex items-center gap-2" onClick={() => { setOpen(false); onAction('reset'); }}>
                <KeyRound size={13} />Force reset
              </button>
            )}
            <div className="border-t border-white/[0.06]" />
            {!isSelf && status !== 'inactive' && (
              <button className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-[#E07070] flex items-center gap-2" onClick={() => { setOpen(false); onAction('deactivate'); }}>
                <ShieldOff size={13} />Deactivate
              </button>
            )}
            {status === 'inactive' && (
              <button className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-green-400 flex items-center gap-2" onClick={() => { setOpen(false); onAction('reactivate'); }}>
                <ShieldCheck size={13} />Reactivate
              </button>
            )}
            {!isSelf && (
              <button className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-[#E07070] flex items-center gap-2" onClick={() => { setOpen(false); onAction('delete'); }}>
                <Trash2 size={13} />Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function UsersTab() {
  const { user: currentUser } = useAuth();
  const [users,  setUsers]  = useState<UserRow[]>([]);
  const [teams,  setTeams]  = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [showCsvImport, setShowCsvImport] = useState(false);

  const [modal, setModal] = useState<
    | { type: 'invite' }
    | { type: 'edit'; user: UserRow }
    | { type: 'confirm'; title: string; message: string; danger?: boolean; phrase?: string; action: () => Promise<void> }
    | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, t] = await Promise.all([usersApi.list(), teamsApi.list()]);
      setUsers(u.users);
      setTeams(t.teams);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function getTeamNames(teamIds: string[]) {
    return teamIds
      .map((id) => teams.find((t) => t.id === id)?.name ?? id)
      .join(', ');
  }

  function handleAction(user: UserRow, action: Action) {
    if (action === 'edit') {
      setModal({ type: 'edit', user });
      return;
    }
    if (action === 'resend') {
      setModal({
        type: 'confirm', title: 'Resend Invite',
        message: `Resend the invitation email to ${user.email}?`,
        action: async () => { await usersApi.resendInvite(user.id); },
      });
      return;
    }
    if (action === 'reset') {
      setModal({
        type: 'confirm', title: 'Force Password Reset',
        message: `${user.fullName}'s session will be invalidated and they will be required to reset their password.`,
        action: async () => { await usersApi.forceReset(user.id); },
      });
      return;
    }
    if (action === 'deactivate') {
      setModal({
        type: 'confirm', danger: true, title: 'Deactivate Account',
        message: `${user.fullName} will immediately lose access. Historical data is preserved.`,
        action: async () => { await usersApi.deactivate(user.id); await load(); },
      });
      return;
    }
    if (action === 'reactivate') {
      setModal({
        type: 'confirm', title: 'Reactivate Account',
        message: `Restore access for ${user.fullName}?`,
        action: async () => { await usersApi.reactivate(user.id); await load(); },
      });
      return;
    }
    if (action === 'delete') {
      setModal({
        type: 'confirm', danger: true, title: 'Delete Account',
        message: `Permanently delete ${user.fullName}'s account? This cannot be undone.`,
        phrase: user.fullName,
        action: async () => { await usersApi.delete(user.id); await load(); },
      });
      return;
    }
  }

  async function handleInvite(data: InviteInput) {
    await usersApi.invite(data);
    await load();
  }

  async function handleUpdate(userId: string, data: InviteInput) {
    await usersApi.update(userId, data);
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-extrabold italic text-[22px] uppercase">Users</h2>
          <p className="text-[12px] text-[#666] mt-0.5">Manage staff accounts and role assignments.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}><RefreshCw size={13} /></Button>
          <Button variant="outline" size="sm" onClick={() => setShowCsvImport(true)}>
            <Upload size={13} />Import from CSV
          </Button>
          <Button variant="primary" size="sm" onClick={() => setModal({ type: 'invite' })}>
            <UserPlus size={13} />Invite User
          </Button>
        </div>
      </div>

      {error && <p className="text-[13px] text-[#E07070]">{error}</p>}

      {loading ? (
        <div className="text-[#555] text-sm">Loading…</div>
      ) : (
        <div className="border border-white/[0.08] rounded-sm overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="text-left px-4 py-2.5 font-bold tracking-[0.08em] uppercase text-[10px] text-[#666]">Name</th>
                <th className="text-left px-4 py-2.5 font-bold tracking-[0.08em] uppercase text-[10px] text-[#666]">Email</th>
                <th className="text-left px-4 py-2.5 font-bold tracking-[0.08em] uppercase text-[10px] text-[#666]">Role</th>
                <th className="text-left px-4 py-2.5 font-bold tracking-[0.08em] uppercase text-[10px] text-[#666]">Teams</th>
                <th className="text-left px-4 py-2.5 font-bold tracking-[0.08em] uppercase text-[10px] text-[#666]">Status</th>
                <th className="text-left px-4 py-2.5 font-bold tracking-[0.08em] uppercase text-[10px] text-[#666]">Last Login</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const status = userStatus(u);
                return (
                  <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white">{u.fullName}</td>
                    <td className="px-4 py-3 text-[#888]">{u.email}</td>
                    <td className="px-4 py-3 text-[#AAA]">{ROLE_LABEL[u.role]}</td>
                    <td className="px-4 py-3 text-[#888]">
                      {u.teamIds?.length ? getTeamNames(u.teamIds) : <span className="text-[#444]">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('capitalize', STATUS_COLORS[status])}>{status}</span>
                    </td>
                    <td className="px-4 py-3 text-[#666]">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : <span className="text-[#444]">Never</span>}
                    </td>
                    <td className="px-4 py-3">
                      <ActionsMenu
                        user={u}
                        currentUserId={currentUser!.id}
                        onAction={(a) => handleAction(u, a)}
                      />
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[#555]">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === 'invite' && (
        <UserForm
          teams={teams}
          currentUserRole={currentUser!.role}
          onSave={handleInvite}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'edit' && (
        <UserForm
          initial={modal.user}
          teams={teams}
          currentUserRole={currentUser!.role}
          onSave={(data) => handleUpdate(modal.user.id, data)}
          onClose={() => setModal(null)}
        />
      )}
      {showCsvImport && (
        <CsvImportUsersModal onClose={() => setShowCsvImport(false)} onImported={load} />
      )}
      {modal?.type === 'confirm' && (
        <ConfirmDialog
          title={modal.title}
          message={modal.message}
          danger={modal.danger}
          phrase={modal.phrase}
          onConfirm={modal.action}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
