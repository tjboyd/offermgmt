import { useState, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function ActivatePage() {
  const [params]              = useSearchParams();
  const navigate              = useNavigate();
  const token                 = params.get('token') ?? '';
  const [password, setPass]   = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await authApi.activate(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Activation failed.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <CenteredCard>
        <p className="text-[#E07070]">Invalid activation link. Contact your administrator.</p>
      </CenteredCard>
    );
  }

  if (done) {
    return (
      <CenteredCard>
        <div className="text-[#66C97A] text-center">
          <div className="text-2xl font-display font-extrabold italic uppercase mb-2">Account Activated!</div>
          <p className="text-sm text-[#AAA]">Redirecting you to login…</p>
        </div>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard>
      <div className="mb-6">
        <div className="font-display font-extrabold italic text-2xl uppercase tracking-[0.02em] mb-1">
          Set Your Password
        </div>
        <p className="text-[13px] text-[#888]">
          Create a secure password to activate your Jr Chargers account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="password" label="Password" type="password"
          value={password} onChange={(e) => setPass(e.target.value)}
          placeholder="Min. 12 characters" required
        />
        <Input
          id="confirm" label="Confirm Password" type="password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat your password" required
        />
        {error && (
          <div className="text-[13px] text-[#E07070] bg-brand/10 border border-brand/25 rounded-sm px-3 py-2">
            {error}
          </div>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={loading}>
          {loading ? 'Activating…' : 'Activate Account'}
        </Button>
      </form>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-bg-secondary border border-white/[0.08] rounded-md p-8">
        {children}
      </div>
    </div>
  );
}
