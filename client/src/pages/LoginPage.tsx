import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useBranding } from '@/context/BrandingContext';

export function LoginPage() {
  const { login, loading } = useAuth();
  const navigate            = useNavigate();
  const { branding }        = useBranding();
  const [email, setEmail]   = useState('');
  const [password, setPass] = useState('');
  const [error, setError]   = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-10">
          {branding?.logoUrl
            ? <img src={branding.logoUrl} alt={branding.orgName ?? 'Logo'} className="w-16 h-16 rounded object-cover" />
            : <div className="w-16 h-16 rounded bg-brand flex items-center justify-center text-white font-bold text-2xl">
                {(branding?.orgName ?? 'J')[0].toUpperCase()}
              </div>
          }
          <div className="text-center">
            <div className="font-display font-extrabold italic text-3xl uppercase tracking-[0.02em] leading-tight text-white">
              {branding?.orgName ?? 'Jr Chargers'}
            </div>
            <div className="text-[11px] text-[#666] tracking-[0.2em] uppercase font-semibold mt-1">
              Offer Management
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@jrchargersbaseball.com"
            autoComplete="email"
            required
          />
          <Input
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPass(e.target.value)}
            placeholder="••••••••••••"
            autoComplete="current-password"
            required
          />

          {error && (
            <div className="text-[13px] text-[#E07070] bg-brand/10 border border-brand/25 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" disabled={loading} className="mt-2">
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        <p className="text-center text-[11px] text-[#444] mt-8">
          Don't have an account? Contact your board administrator.
        </p>
      </div>
    </div>
  );
}
