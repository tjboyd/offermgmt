import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format a date-only string (YYYY-MM-DD) as MM/DD/YYYY
export function fmtBirthDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by the spec,
  // which shifts them back one day in negative-offset timezones. Force local
  // interpretation by replacing hyphens so the browser treats it as local time.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(iso.replace(/-/g, '/'))
    : new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1)   return 'just now';
  if (min < 60)  return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24)   return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30)    return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}

export function initials(firstName: string, lastName: string): string {
  return ((firstName[0] ?? '') + (lastName[0] ?? '')).toUpperCase();
}
