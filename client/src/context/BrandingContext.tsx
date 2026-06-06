import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { brandingApi, OrgBranding } from '@/lib/api';

/** Parse a hex color (#RGB or #RRGGBB) into [r, g, b] channel integers. */
function hexToChannels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Returns a darkened hex string (for deriving hover/pressed from primary). */
function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToChannels(hex);
  const d = (v: number) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0');
  return `#${d(r)}${d(g)}${d(b)}`;
}

/**
 * Apply brand color CSS variables.
 * Tailwind uses `rgb(var(--brand) / <alpha-value>)` so the variables must be
 * "R G B" channel strings (e.g. "173 3 3"), NOT hex strings.
 *
 * Uses two methods in tandem so it works regardless of how the browser resolves
 * inline-style vs stylesheet precedence:
 *   1. `element.style.setProperty` — inline style on <html>, highest specificity
 *   2. Injected <style> tag appended to <head> — wins on source-order
 */
function applyBrandColors(primary: string) {
  const ch  = (hex: string) => hexToChannels(hex).join(' ');
  const b   = ch(primary);
  const bh  = ch(darken(primary, 0.15));
  const bp  = ch(darken(primary, 0.25));

  // 1 — inline style (highest specificity)
  const root = document.documentElement;
  root.style.setProperty('--brand',         b);
  root.style.setProperty('--brand-hover',   bh);
  root.style.setProperty('--brand-pressed', bp);

  // 2 — <style> tag appended to <head> (wins on source order vs compiled stylesheet)
  let el = document.getElementById('jrc-brand-override') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'jrc-brand-override';
    document.head.appendChild(el);
  }
  el.textContent = `:root{--brand:${b};--brand-hover:${bh};--brand-pressed:${bp}}`;
}

interface BrandingContextValue {
  branding:          OrgBranding | null;
  refresh:           () => Promise<void>;
  applyColors:       (hex: string) => void;   // live preview — call as user types
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: null,
  refresh: async () => {},
  applyColors: () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<OrgBranding | null>(null);

  const refresh = async () => {
    try {
      const b = await brandingApi.get();
      setBranding(b);
      if (b.brandPrimary) applyBrandColors(b.brandPrimary);
    } catch (err) {
      console.error('[BrandingContext] refresh failed:', err);
      // Keep CSS defaults defined in :root
    }
  };

  useEffect(() => { refresh(); }, []);

  return (
    <BrandingContext.Provider value={{ branding, refresh, applyColors: applyBrandColors }}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
