import { cn } from '@/lib/utils';

export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'waitlisted' | 'rejected';

const STATUS_CONFIG: Record<OfferStatus, { label: string; dot: string; cls: string }> = {
  draft:      { label: 'Draft',        dot: 'bg-[#888]',    cls: 'bg-white/[0.06] text-[#AAA] border border-white/[0.08]' },
  sent:       { label: 'Sent',         dot: 'bg-[#E5A567]', cls: 'bg-[#D99950]/[0.12] text-[#E5A567] border border-[#D99950]/30' },
  accepted:   { label: 'Accepted',     dot: 'bg-[#66C97A]', cls: 'bg-[#46B35A]/[0.12] text-[#66C97A] border border-[#46B35A]/30' },
  declined:   { label: 'Declined',     dot: 'bg-[#E07070]', cls: 'bg-[#AD0303]/[0.15] text-[#E07070] border border-[#AD0303]/40' },
  expired:    { label: 'Expired',      dot: 'bg-[#666]',    cls: 'bg-white/[0.04] text-[#888] border border-white/[0.08]' },
  waitlisted: { label: 'Waitlisted',   dot: 'bg-[#6BAEFF]', cls: 'bg-[#508CD9]/[0.12] text-[#6BAEFF] border border-[#508CD9]/30' },
  rejected:   { label: 'Not Selected', dot: 'bg-[#555]',    cls: 'bg-black/40 text-[#666] border border-white/[0.08]' },
};

interface BadgeProps {
  status: OfferStatus;
  className?: string;
}

export function StatusBadge({ status, className }: BadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.12em] uppercase whitespace-nowrap',
      cfg.cls, className,
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const isElevated = role === 'admin' || role === 'board';
  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-[0.1em] uppercase border',
      isElevated
        ? 'bg-brand/20 text-[#E07070] border-brand/40'
        : 'bg-white/[0.06] text-[#AAA] border-white/[0.08]',
    )}>
      {role === 'admin' ? 'Admin' : role === 'board' ? 'Board' : role === 'head_coach' ? 'Head Coach' : 'Asst. Coach'}
    </span>
  );
}
