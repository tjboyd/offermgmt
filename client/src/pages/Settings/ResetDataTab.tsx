import { useState } from 'react';
import { Skull } from 'lucide-react';
import { wizardApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const PHRASE = 'RESET ALL DATA';

export function ResetDataTab() {
  const [typed, setTyped]   = useState('');
  const [busy,  setBusy]    = useState(false);
  const [done,  setDone]    = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleReset() {
    setBusy(true);
    setError(null);
    try {
      await wizardApi.resetData(PHRASE);
      setDone(true);
      setTyped('');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Reset failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="font-display font-extrabold italic text-[22px] uppercase">Reset Data</h2>
        <p className="text-[12px] text-[#555] mt-0.5">Development and staging only. Not available in production.</p>
      </div>

      <div className="border border-brand/40 rounded-sm p-6 space-y-4 bg-brand/[0.04]">
        <div className="flex items-center gap-3 text-brand">
          <Skull size={20} />
          <span className="font-display font-extrabold italic text-[16px] uppercase tracking-[0.06em]">Destructive Action</span>
        </div>

        <p className="text-[13px] text-[#AAA] leading-relaxed">
          This will permanently delete all <strong>player records</strong>, <strong>offers</strong>,
          <strong> activity logs</strong>, and <strong>sync history</strong> for the current environment.
          Season configuration, teams, users, and email templates are preserved.
        </p>

        <p className="text-[12px] text-[#666]">
          This action is irreversible. Use it only to reset a dev or staging environment to a clean state.
        </p>

        {done && (
          <div className="p-3 bg-green-900/20 border border-green-700/40 rounded-sm text-[13px] text-green-400">
            Data cleared. All player, offer, and activity records have been removed.
          </div>
        )}

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
              disabled={typed !== PHRASE || busy}
              onClick={handleReset}
            >
              {busy ? 'Resetting…' : 'Reset All Data'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
