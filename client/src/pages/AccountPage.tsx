import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, KeyRound, User } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = {
  admin:           'Admin',
  board:           'Board',
  head_coach:      'Head Coach',
  assistant_coach: 'Assistant Coach',
};

// ─── Change Password Section ──────────────────────────────────────────────────

function ChangePasswordSection() {
  const [current, setCurrent]   = useState('');
  const [next,    setNext]      = useState('');
  const [confirm, setConfirm]   = useState('');
  const [busy,    setBusy]      = useState(false);
  const [ok,      setOk]        = useState(false);
  const [error,   setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { setError('New passwords do not match.'); return; }
    setBusy(true);
    setOk(false);
    setError(null);
    try {
      await authApi.changePassword(current, next);
      setOk(true);
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Current Password"
        type="password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        autoComplete="current-password"
        required
      />
      <Input
        label="New Password"
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        autoComplete="new-password"
        required
      />
      <Input
        label="Confirm New Password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        required
        error={confirm && next && confirm !== next ? 'Passwords do not match' : undefined}
      />
      {ok    && <p className="text-[12px] text-green-400">Password updated. Other sessions have been signed out.</p>}
      {error && <p className="text-[12px] text-[#E07070]">{error}</p>}
      <Button type="submit" variant="outline" size="sm" disabled={busy || !current || !next || !confirm}>
        <KeyRound size={13} />
        {busy ? 'Updating…' : 'Update Password'}
      </Button>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [name,      setName]      = useState(user?.fullName ?? '');
  const [nameBusy,  setNameBusy]  = useState(false);
  const [nameOk,    setNameOk]    = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name === user?.fullName) return;
    setNameBusy(true);
    setNameOk(false);
    setNameError(null);
    try {
      await authApi.updateMe(name.trim());
      setNameOk(true);
      setTimeout(() => setNameOk(false), 3000);
    } catch (err: unknown) {
      setNameError((err as Error).message ?? 'Failed to save.');
    } finally {
      setNameBusy(false);
    }
  }

  async function handleSignOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  if (!user) return null;

  const initials = [user.fullName.split(' ')[0]?.[0], user.fullName.split(' ')[1]?.[0]]
    .filter(Boolean).join('').toUpperCase();

  return (
    <div className="scroll h-full px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-brand mb-1">Your Account</div>
        <h1 className="font-display font-extrabold italic text-[42px] uppercase leading-none">Profile</h1>
      </div>

      {/* Two-column layout: identity card left, forms right */}
      <div className="grid gap-6" style={{ gridTemplateColumns: '280px 1fr' }}>

        {/* Left — identity card */}
        <div className="space-y-4">
          <div className="border border-white/[0.08] rounded-sm p-6 flex flex-col items-center text-center gap-3">
            <div className={cn(
              'w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0',
              'font-display font-extrabold italic text-[28px] text-white',
              user.role === 'admin' || user.role === 'board' ? 'bg-brand' : 'bg-[#333]',
            )}>
              {initials}
            </div>
            <div>
              <div className="text-[17px] font-bold text-white leading-snug">{user.fullName}</div>
              <div className="text-[12px] text-[#666] mt-1 break-all">{user.email}</div>
            </div>
            <span className="text-[10px] font-bold tracking-[0.16em] uppercase px-2.5 py-1 rounded-sm bg-brand/15 text-brand">
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          </div>

          {/* Sign out */}
          <div className="border border-brand/20 rounded-sm p-5 bg-brand/[0.02] space-y-3">
            <div className="font-bold text-[13px] text-white">Sign Out</div>
            <div className="text-[12px] text-[#666] leading-relaxed">You'll need to log in again to access the system.</div>
            <Button variant="outline-red" size="sm" onClick={handleSignOut} className="w-full justify-center">
              <LogOut size={13} />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Right — edit forms */}
        <div className="space-y-4">

          {/* Display name */}
          <section className="border border-white/[0.08] rounded-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              <User size={14} className="text-[#666]" />
              <span className="font-display font-extrabold italic text-[14px] uppercase tracking-[0.06em]">Display Name</span>
            </div>
            <form onSubmit={handleSaveName} className="space-y-3">
              <Input
                label="Full Name"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameOk(false); }}
                required
              />
              <p className="text-[11px] text-[#555]">
                Email address can only be changed by an Admin.
              </p>
              {nameOk    && <p className="text-[12px] text-green-400">Name updated.</p>}
              {nameError && <p className="text-[12px] text-[#E07070]">{nameError}</p>}
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={nameBusy || !name.trim() || name === user.fullName}
              >
                {nameBusy ? 'Saving…' : 'Save Name'}
              </Button>
            </form>
          </section>

          {/* Change password */}
          <section className="border border-white/[0.08] rounded-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound size={14} className="text-[#666]" />
              <span className="font-display font-extrabold italic text-[14px] uppercase tracking-[0.06em]">Change Password</span>
            </div>
            <ChangePasswordSection />
          </section>

        </div>{/* end right column */}
      </div>{/* end grid */}
    </div>
  );
}
