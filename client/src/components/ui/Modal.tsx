import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, footer, width = 640 }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-[#111] border border-white/[0.16] rounded-md flex flex-col max-h-[92vh] w-full animate-slide-up"
        style={{ maxWidth: width }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.08]">
          <h2 className="font-display font-extrabold italic text-[22px] uppercase tracking-[0.02em]">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-sm text-[#666] hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-white/[0.08]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Simple field wrapper
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#888]">{label}</label>
      {children}
    </div>
  );
}
