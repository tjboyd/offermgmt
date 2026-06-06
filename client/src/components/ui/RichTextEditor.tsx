/**
 * RichTextEditor — WYSIWYG email body editor built on Tiptap.
 * Outputs / accepts plain HTML. Toolbar covers font family, size, color,
 * bold, italic, underline, links, and button-style links.
 */
import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { Extension } from '@tiptap/core';
import { cn } from '@/lib/utils';

// ─── FontSize custom extension ────────────────────────────────────────────────

const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (attrs) => attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: { chain: () => ReturnType<Editor['chain']> }) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: { chain: () => ReturnType<Editor['chain']> }) =>
        chain().setMark('textStyle', { fontSize: null }).run(),
    } as never;
  },
});

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  { label: 'Default',   value: '' },
  { label: 'Arial',     value: 'Arial, sans-serif' },
  { label: 'Georgia',   value: 'Georgia, serif' },
  { label: 'Trebuchet', value: "'Trebuchet MS', sans-serif" },
  { label: 'Verdana',   value: 'Verdana, sans-serif' },
  { label: 'Courier',   value: "'Courier New', monospace" },
];

const FONT_SIZES = ['11px','12px','13px','14px','16px','18px','20px','24px','28px','32px'];

const COLORS = [
  '#FFFFFF','#CCCCCC','#888888','#444444','#111111',
  '#AD0303','#C8372B','#E07070','#C8A22A','#46B35A',
  '#2A7FC8','#5B5BDA','#8E44AD','#E67E22','#1ABC9C',
];

// ─── Toolbar helpers ──────────────────────────────────────────────────────────

function ToolBtn({
  active, disabled, onClick, title, children,
}: {
  active?: boolean; disabled?: boolean;
  onClick: () => void; title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded text-[13px] transition-colors select-none',
        active
          ? 'bg-white/20 text-white'
          : 'text-[#888] hover:text-white hover:bg-white/[0.08]',
        disabled && 'opacity-30 cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-white/[0.1] mx-0.5 shrink-0" />;
}

// ─── Link dialog ──────────────────────────────────────────────────────────────

function LinkDialog({
  initial,
  onConfirm,
  onClose,
}: {
  initial: string;
  onConfirm: (url: string, text?: string) => void;
  onClose: () => void;
}) {
  const [url,  setUrl]  = useState(initial);
  const [text, setText] = useState('');
  return (
    <div className="absolute z-50 top-full left-0 mt-1 bg-[#1E1E1E] border border-white/[0.12] rounded-md shadow-xl p-3 flex flex-col gap-2 min-w-[280px]">
      <div className="text-[11px] font-bold uppercase tracking-widest text-[#666] mb-1">Insert Link</div>
      <input
        autoFocus
        className="bg-[#131313] border border-white/[0.10] rounded-sm px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-brand w-full"
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(url, text || undefined); if (e.key === 'Escape') onClose(); }}
      />
      <input
        className="bg-[#131313] border border-white/[0.10] rounded-sm px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-brand w-full"
        placeholder="Link text (optional — uses selection if blank)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(url, text || undefined); if (e.key === 'Escape') onClose(); }}
      />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="text-[12px] text-[#555] hover:text-white px-2 py-1">Cancel</button>
        <button
          type="button"
          onClick={() => onConfirm(url, text || undefined)}
          className="text-[12px] bg-brand text-white rounded-sm px-3 py-1 hover:bg-brand/80 transition-colors"
        >
          Insert
        </button>
      </div>
    </div>
  );
}

// ─── Button link dialog ───────────────────────────────────────────────────────

function ButtonDialog({
  onConfirm,
  onClose,
}: {
  onConfirm: (text: string, url: string, color: string) => void;
  onClose: () => void;
}) {
  const [text,  setText]  = useState('Register Now');
  const [url,   setUrl]   = useState('{{registrationUrl}}');
  const [color, setColor] = useState('#AD0303');
  return (
    <div className="absolute z-50 top-full left-0 mt-1 bg-[#1E1E1E] border border-white/[0.12] rounded-md shadow-xl p-3 flex flex-col gap-2 min-w-[300px]">
      <div className="text-[11px] font-bold uppercase tracking-widest text-[#666] mb-1">Insert Button</div>
      <input
        autoFocus
        className="bg-[#131313] border border-white/[0.10] rounded-sm px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-brand w-full"
        placeholder="Button text"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <input
        className="bg-[#131313] border border-white/[0.10] rounded-sm px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-brand w-full"
        placeholder="URL or {{registrationUrl}}"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[#555]">Color</span>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
          className="w-8 h-7 rounded border border-white/[0.1] bg-transparent cursor-pointer" />
        <span className="text-[11px] font-mono text-[#555]">{color}</span>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="text-[12px] text-[#555] hover:text-white px-2 py-1">Cancel</button>
        <button
          type="button"
          onClick={() => onConfirm(text, url, color)}
          className="text-[12px] bg-brand text-white rounded-sm px-3 py-1 hover:bg-brand/80 transition-colors"
        >
          Insert
        </button>
      </div>
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: Editor }) {
  const [showLink,     setShowLink]     = useState(false);
  const [showButton,   setShowButton]   = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowLink(false); setShowButton(false); setShowColorPicker(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentFont  = (editor.getAttributes('textStyle').fontFamily as string | undefined) ?? '';
  const currentSize  = (editor.getAttributes('textStyle').fontSize  as string | undefined) ?? '';
  const currentColor = (editor.getAttributes('textStyle').color     as string | undefined) ?? '#FFFFFF';

  function insertLink(url: string, linkText?: string) {
    setShowLink(false);
    if (!url) return;
    const href = url.trim();
    if (linkText) {
      editor.chain().focus()
        .insertContent(`<a href="${href}">${linkText}</a>`)
        .run();
    } else {
      editor.chain().focus().setLink({ href }).run();
    }
  }

  function insertButton(text: string, url: string, color: string) {
    setShowButton(false);
    const html = `<div style="text-align:center;margin:20px 0">` +
      `<a href="${url}" style="display:inline-block;background:${color};color:#ffffff;` +
      `font-family:Arial,sans-serif;font-weight:700;font-size:15px;text-decoration:none;` +
      `padding:12px 28px;border-radius:4px;letter-spacing:0.04em">${text}</a></div>`;
    editor.chain().focus().insertContent(html).run();
  }

  return (
    <div ref={toolbarRef} className="relative flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-white/[0.08] bg-[#161616]">

      {/* Font family */}
      <select
        value={currentFont}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontFamily(v).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        className="bg-[#1E1E1E] border border-white/[0.10] rounded-sm text-[12px] text-[#CCC] px-1.5 py-0.5 outline-none focus:border-brand h-7 max-w-[110px]"
      >
        {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>

      {/* Font size */}
      <select
        value={currentSize}
        onChange={(e) => {
          const v = e.target.value;
          if (v) (editor.chain().focus() as unknown as Record<string, (s: string) => { run: () => void }>).setFontSize(v).run();
          else (editor.chain().focus() as unknown as Record<string, () => { run: () => void }>).unsetFontSize().run();
        }}
        className="bg-[#1E1E1E] border border-white/[0.10] rounded-sm text-[12px] text-[#CCC] px-1.5 py-0.5 outline-none focus:border-brand h-7 w-[72px]"
      >
        <option value="">Size</option>
        {FONT_SIZES.map((s) => <option key={s} value={s}>{s.replace('px', '')}</option>)}
      </select>

      <Divider />

      {/* Bold / Italic / Underline */}
      <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
        <strong>B</strong>
      </ToolBtn>
      <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
        <em>I</em>
      </ToolBtn>
      <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
        <span style={{ textDecoration: 'underline' }}>U</span>
      </ToolBtn>

      <Divider />

      {/* Color */}
      <div className="relative">
        <button
          type="button"
          title="Text color"
          onClick={() => { setShowColorPicker((v) => !v); setShowLink(false); setShowButton(false); }}
          className="flex flex-col items-center justify-center w-7 h-7 rounded hover:bg-white/[0.08] transition-colors gap-0.5"
        >
          <span className="text-[13px] font-bold text-white leading-none" style={{ color: currentColor }}>A</span>
          <span className="w-4 h-1 rounded-full" style={{ background: currentColor }} />
        </button>
        {showColorPicker && (
          <div className="absolute z-50 top-full left-0 mt-1 bg-[#1E1E1E] border border-white/[0.12] rounded-md shadow-xl p-2 flex flex-col gap-2">
            <div className="grid grid-cols-5 gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { editor.chain().focus().setColor(c).run(); setShowColorPicker(false); }}
                  className="w-6 h-6 rounded-sm border border-white/10 hover:scale-110 transition-transform"
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-white/[0.08]">
              <span className="text-[11px] text-[#555]">Custom</span>
              <input
                type="color"
                defaultValue={currentColor}
                onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                className="w-8 h-6 rounded border border-white/[0.1] bg-transparent cursor-pointer"
              />
              <button
                type="button"
                onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPicker(false); }}
                className="text-[11px] text-[#555] hover:text-white ml-auto"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      <Divider />

      {/* Link */}
      <div className="relative">
        <ToolBtn
          active={editor.isActive('link')}
          title="Insert link"
          onClick={() => {
            setShowLink((v) => !v);
            setShowButton(false);
            setShowColorPicker(false);
          }}
        >
          🔗
        </ToolBtn>
        {showLink && (
          <LinkDialog
            initial={editor.getAttributes('link').href as string ?? ''}
            onConfirm={insertLink}
            onClose={() => setShowLink(false)}
          />
        )}
      </div>

      {/* Remove link */}
      {editor.isActive('link') && (
        <ToolBtn title="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>
          🔗̶
        </ToolBtn>
      )}

      <Divider />

      {/* Button */}
      <div className="relative">
        <button
          type="button"
          title="Insert button link"
          onClick={() => { setShowButton((v) => !v); setShowLink(false); setShowColorPicker(false); }}
          className="flex items-center gap-1 h-7 px-2 rounded text-[11px] font-bold text-[#AAA] hover:text-white hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
        >
          + Button
        </button>
        {showButton && (
          <ButtonDialog onConfirm={insertButton} onClose={() => setShowButton(false)} />
        )}
      </div>

      <Divider />

      {/* Clear formatting */}
      <ToolBtn title="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
        <span className="text-[11px]">Tx</span>
      </ToolBtn>
    </div>
  );
}

// ─── HTML normalisation helpers ───────────────────────────────────────────────

/**
 * Normalise HTML before loading into Tiptap.
 *
 * Problems we fix:
 *  1. <p><br></p>  → <p></p>           Tiptap stores blank-line paragraphs as
 *                                       empty nodes and serialises them as
 *                                       <p></p>, so we align on that form.
 *  2. trailing <br> in paragraphs       e.g. <p>text <br></p> — a <br> at the
 *                                       very end of a paragraph is a no-op in
 *                                       rendering but confuses Tiptap's hard-
 *                                       break handling.
 *  3. mid-paragraph <br> as sign-off    e.g. <p>Play hard.<br/>— Coaches</p>
 *                                       was used as a cheap line-break in old
 *                                       templates. Split into two <p> tags so
 *                                       Tiptap treats them as paragraphs, which
 *                                       is consistent with how the visual editor
 *                                       inserts paragraphs via Enter.
 */
export function htmlForEditor(html: string): string {
  return html
    // 1. blank-line paragraphs: strip the placeholder <br>
    .replace(/<p><br\s*\/?><\/p>/gi, '<p></p>')
    // 2. trailing <br> inside a paragraph — just remove it
    .replace(/(\s*<br\s*\/?>\s*)<\/p>/gi, '</p>')
    // 3. mid-paragraph <br> → split into two paragraphs
    .replace(/<br\s*\/?>/gi, '</p><p>');
}

/**
 * Ensure empty paragraphs have an explicit <br> in the saved/emailed HTML.
 * Most email clients (and the preview renderer) collapse `<p></p>` to zero
 * height, but `<p><br></p>` reliably renders as a blank line.
 */
export function htmlForEmail(html: string): string {
  return html.replace(/<p><\/p>/g, '<p><br></p>');
}

/**
 * Canonical form for dirty-checking — both sides normalised identically so
 * cosmetic HTML differences don't show as unsaved changes.
 */
export function normaliseForCompare(html: string): string {
  return htmlForEditor(html)                        // apply all editor normalisation
    .replace(/<p><\/p>/g, '<p><br></p>')            // treat empty paragraphs as equal
    .replace(/\s+/g, ' ')                           // collapse whitespace
    .trim();
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface Props {
  html: string;
  onChange: (html: string) => void;
}

export function RichTextEditor({ html, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, code: false, codeBlock: false, blockquote: false, horizontalRule: false }),
      TextStyle,
      FontSize,
      FontFamily,
      Color,
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: null, target: null } }),
    ],
    // Always feed Tiptap the editor-normalised form (no <br> in empty <p>)
    content: htmlForEditor(html),
    onUpdate: ({ editor }) => {
      // Emit email-safe HTML (empty paragraphs get explicit <br>)
      onChange(htmlForEmail(editor.getHTML()));
    },
    editorProps: {
      attributes: {
        class: 'jrc-rte outline-none min-h-[220px] px-4 py-3 text-[14px] text-[#111] max-w-none',
      },
    },
  });

  // Sync when the parent's html prop changes (e.g. user edits the HTML tab).
  // Guard with normalised comparison so the <p></p> ↔ <p><br></p> round-trip
  // never triggers a spurious setContent, which would in turn fire onUpdate.
  const prevHtml = useRef(html);
  useEffect(() => {
    if (!editor) return;
    const incoming = normaliseForCompare(html);
    const current  = normaliseForCompare(htmlForEmail(editor.getHTML()));
    if (html !== prevHtml.current && incoming !== current) {
      editor.commands.setContent(htmlForEditor(html));
    }
    prevHtml.current = html;
  }, [html, editor]);

  if (!editor) return null;

  return (
    <div className="border border-white/[0.08] rounded-sm overflow-hidden bg-white">
      {/* Scoped CSS: make <p> rendering match plain-HTML email output.
          Browser default adds margin: 1em 0 to <p>, making the editor
          look double-spaced vs the actual saved HTML. Reset to match. */}
      <style>{`
        /* !important overrides ProseMirror's injected p { margin: 1em 0 } */
        .jrc-rte p            { margin: 0 0 0.7em 0 !important; padding: 0; min-height: 1.5em; line-height: 1.6; }
        .jrc-rte p:last-child { margin-bottom: 0 !important; }
        .jrc-rte a            { color: #1a6ec8; text-decoration: underline; }
        .jrc-rte strong       { font-weight: bold; }
        .jrc-rte em           { font-style: italic; }
        .jrc-rte ul, .jrc-rte ol { margin: 0.4em 0 0.4em 1.5em; padding: 0; }
      `}</style>
      <div className="bg-[#161616]">
        <Toolbar editor={editor} />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
