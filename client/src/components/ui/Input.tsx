import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          'bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none w-full',
          'placeholder:text-[#3a3a3a] transition-colors duration-150',
          'focus:border-brand',
          error && 'border-brand',
          className,
        )}
        {...props}
      />
      {error && <p className="text-[11px] text-[#E07070]">{error}</p>}
    </div>
  ),
);

Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, className, id, children, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888]">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={cn(
          'bg-[#242424] border border-white/[0.08] rounded-sm px-3 py-2 text-white text-sm outline-none w-full',
          'transition-colors duration-150 focus:border-brand',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  ),
);

Select.displayName = 'Select';
