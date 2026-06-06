import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SEErrorBannerProps {
  code?: string;
  message?: string;
}

export function SEErrorBanner({ code, message }: SEErrorBannerProps) {
  const isMissing = code === 'SE_CREDENTIALS_MISSING';
  const isAuthFail = code === 'SE_AUTH_FAILED';

  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-yellow-500/[0.08] border border-yellow-500/25 rounded-sm text-[13px]">
      <AlertTriangle size={15} className="text-yellow-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <span className="text-yellow-300 font-semibold">
          {isMissing
            ? 'SportsEngine not connected. '
            : isAuthFail
            ? 'SportsEngine authentication failed. '
            : 'SportsEngine error. '}
        </span>
        <span className="text-[#AAA]">
          {message ?? 'Sync and returning player lookup are unavailable.'}
        </span>
        {' '}
        <Link
          to="/settings/integrations"
          className="text-brand underline underline-offset-2 hover:text-brand-hover"
        >
          Fix in Settings → Integrations
        </Link>
      </div>
    </div>
  );
}
