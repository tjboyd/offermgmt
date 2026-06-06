import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'outline-red';
type Size    = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary:     'bg-brand text-white hover:bg-brand-hover active:bg-brand-pressed disabled:opacity-40',
  outline:     'bg-transparent text-white border border-white/20 hover:border-white hover:bg-white/[0.04] disabled:opacity-40',
  ghost:       'bg-transparent text-[#AAA] hover:text-white hover:bg-white/[0.06] disabled:opacity-40',
  danger:      'bg-transparent text-white border border-white/[0.18] hover:text-brand hover:border-brand hover:bg-brand/[0.08] disabled:opacity-40',
  'outline-red': 'bg-transparent text-brand border border-brand hover:bg-brand/10 disabled:opacity-40',
};

const SIZE: Record<Size, string> = {
  sm: 'text-[12px] px-3 py-1.5',
  md: 'text-[13px] px-4 py-2.5',
  lg: 'text-[15px] px-5 py-3',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'outline', size = 'md', className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-display font-extrabold italic uppercase tracking-[0.04em] rounded-sm',
        'transition-all duration-150 whitespace-nowrap cursor-pointer',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);

Button.displayName = 'Button';
