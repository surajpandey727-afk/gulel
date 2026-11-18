"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  AtSign, Baseline, Bold, Eraser, Heading2, Heading3, Highlighter, IndentDecrease, IndentIncrease, Italic, List, ListOrdered, Maximize2, Minimize2, Pilcrow, Redo2, Underline, Undo2, X,
} from "lucide-react";
import { cn } from "@/components/neo/cn";
import { Tip } from "@/components/neo/controls";
import { normaliseStyle, sanitizeRich, toSafeHtml } from "@/lib/notes/rich";
import { membersAction } from "@/app/(app)/organisations/records-actions";

type Member = { id: string; name: string; email: string | null };
let membersCache: Promise<Member[]> | null = null;
const loadMembers = () => (membersCache ??= membersAction().then((r) => (r.ok ? r.data : [])).catch(() => []));

/** Text colours and highlights, all taken from the design system palette (dark mode remaps them in globals.css). */
export const TEXT_COLOURS = [
  { name: "Default", value: "#141414" }, { name: "Forest", value: "#071e07" }, { name: "Green", value: "#2f5d3a" },
  { name: "Amber", value: "#8a5a1f" }, { name: "Red", value: "#7a1020" }, { name: "Muted", value: "#6b665f" },
];
export const HIGHLIGHTS = [
  { name: "Buttercream", value: "#faf1ca" }, { name: "Amber", value: "#e0b26759" }, { name: "Green", value: "#5c7a4a40" },
  { name: "Red", value: "#7a102026" }, { name: "Stone", value: "#a69c8f40" },
];

type Cmd = "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList";

/**
 * A rich text editor for notes: headings, bold/italic/underline, colour, highlight, bullet and numbered lists (nested with
 * Tab), indent, undo/redo and clear formatting. It grows with its content up to `maxHeight`, then scrolls inside; Expand
 * opens the same note in a large reading/editing window. Output is sanitised HTML (see lib/notes/rich).
 */
export function RichEditor({ value, onChange, placeholder = "Write a note…", autoFocus, onSubmit, label = "Note", minHeight = 120, maxHeight = "min(60vh, 560px)", expandTitle, compact, readOnly, mentionable }: {
  value: string; onChange: (html: string) => void; placeholder?: string; autoFocus?: boolean; onSubmit?: () => void; label?: string; /** Type @ to mention a teammate (they get notified). */ mentionable?: boolean;
  minHeight?: number; maxHeight?: string; expandTitle?: string; compact?: boolean; readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [version, setVersion] = useState(0);
  const latest = useRef(value);
  const change = useCallback((h: string) => { latest.current = h; onChange(h); }, [onChange]);
  return (
    <>
      {!expanded && (
        <EditorSurface key={version} initial={latest.current} onChange={change} placeholder={placeholder} autoFocus={autoFocus} onSubmit={onSubmit} label={label} mentionable={mentionable}
          minHeight={minHeight} maxHeight={maxHeight} compact={compact} readOnly={readOnly} onExpand={() => setExpanded(true)} />
      )}
      {expanded && <div className="rounded-neo neo-inset-sm px-4 py-3 text-xs text-ink-3" style={{ minHeight }}>Editing in the expanded window…</div>}
      <Dialog.Root open={expanded} onOpenChange={(o) => { if (!o) { setExpanded(false); setVersion((v) => v + 1); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-[#14141433] backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] flex h-[min(88dvh,960px)] w-[min(calc(100vw-2rem),1100px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-neo-lg bg-canvas neo-raised-lg"
            onEscapeKeyDown={(e) => { if ((e.target as HTMLElement)?.closest?.("[data-rich-popover]")) e.preventDefault(); }}>
            <div className="flex items-center gap-3 border-b border-hairline/70 px-5 py-3">
              <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{expandTitle ?? label}</Dialog.Title>
              <Dialog.Description className="sr-only">Expanded note editor. Changes are kept when you collapse.</Dialog.Description>
              <Tip content="Collapse (Esc)">
                <Dialog.Close className="grid h-8 w-8 place-items-center rounded-full neo-raised-sm text-ink-2 hover:text-oxblood" aria-label="Collapse"><Minimize2 className="h-4 w-4" /></Dialog.Close>
              </Tip>
            </div>
            <div className="min-h-0 flex-1 px-5 pb-5 pt-3">
              <EditorSurface initial={latest.current} onChange={change} placeholder={placeholder} autoFocus onSubmit={onSubmit} label={label} minHeight={0} maxHeight="100%" fill readOnly={readOnly} mentionable={mentionable} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function EditorSurface({ initial, onChange, placeholder, autoFocus, onSubmit, label, minHeight, maxHeight, onExpand, fill, compact, readOnly, mentionable }: {
  initial: string; onChange: (html: string) => void; placeholder: string; autoFocus?: boolean; onSubmit?: () => void; label: string;
  minHeight: number; maxHeight: string; onExpand?: () => void; fill?: boolean; compact?: boolean; readOnly?: boolean; mentionable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<Record<string, boolean>>({});
  const [block, setBlock] = useState("p");

  useLayoutEffect(() => {
    const el = ref.current!;
    el.innerHTML = initial ? toSafeHtml(initial) : "";
    if (autoFocus) {
      el.focus();
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
    }
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* older browsers */ }
    el.querySelectorAll<HTMLElement>("[data-mention]").forEach((m) => m.setAttribute("contenteditable", "false"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Keep colours as hex in the live DOM too, so dark mode maps them while you edit.
    el.querySelectorAll<HTMLElement>("[style]").forEach((n) => { const s = normaliseStyle(n.getAttribute("style") ?? ""); if (s) n.setAttribute("style", s); else n.removeAttribute("style"); });
    onChange(el.innerHTML === "<br>" ? "" : el.innerHTML);
  }, [onChange]);

  const refresh = useCallback(() => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) return;
    const q = (c: string) => { try { return document.queryCommandState(c); } catch { return false; } };
    setState({ bold: q("bold"), italic: q("italic"), underline: q("underline"), insertUnorderedList: q("insertUnorderedList"), insertOrderedList: q("insertOrderedList") });
    let n: Node | null = sel.anchorNode;
    while (n && n !== el && !(n instanceof HTMLElement && /^(P|H2|H3|H4|LI|DIV|BLOCKQUOTE)$/.test(n.tagName))) n = n.parentNode;
    setBlock(n instanceof HTMLElement && n !== el ? n.tagName.toLowerCase() : "p");
  }, []);
  useEffect(() => {
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, [refresh]);

  const exec = (cmd: string, arg?: string, css = false) => {
    ref.current?.focus();
    try {
      document.execCommand("styleWithCSS", false, css ? "true" : "false");
      document.execCommand(cmd, false, arg);
    } finally { emit(); refresh(); }
  };
  const toggle = (c: Cmd) => exec(c);
  const heading = (tag: "p" | "h2" | "h3") => exec("formatBlock", block === tag && tag !== "p" ? "<p>" : `<${tag}>`);

  /* ---------- @mentions */
  const [members, setMembers] = useState<Member[]>([]);
  const [mention, setMention] = useState<{ query: string; top: number; left: number; active: number } | null>(null);
  useEffect(() => { if (mentionable) void loadMembers().then(setMembers); }, [mentionable]);
  const matches = mention ? members.filter((m) => `${m.name} ${m.email ?? ""}`.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6) : [];
  const detectMention = () => {
    if (!mentionable) return;
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !sel.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !ref.current?.contains(node)) return setMention(null);
    const before = (node.textContent ?? "").slice(0, sel.anchorOffset);
    const m = /(?:^|[\s\u00a0(])@([\p{L}\p{N}._-]{0,30})$/u.exec(before);
    if (!m) return setMention(null);
    const range = sel.getRangeAt(0).cloneRange();
    const rect = range.getBoundingClientRect().height ? range.getBoundingClientRect() : (node.parentElement ?? ref.current).getBoundingClientRect();
    setMention((cur) => ({ query: m[1], top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 280), active: cur && cur.query === m[1] ? cur.active : 0 }));
  };
  const pick = (mem: Member) => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !node || node.nodeType !== Node.TEXT_NODE || !mention) return;
    const end = sel.anchorOffset, start = end - mention.query.length - 1;
    const range = document.createRange();
    range.setStart(node, Math.max(0, start)); range.setEnd(node, end); range.deleteContents();
    const tag = document.createElement("span");
    tag.setAttribute("data-mention", mem.id); tag.setAttribute("contenteditable", "false"); tag.textContent = `@${mem.name}`;
    const space = document.createTextNode("\u00a0");
    range.insertNode(space); range.insertNode(tag);
    const after = document.createRange(); after.setStartAfter(space); after.collapse(true);
    sel.removeAllRanges(); sel.addRange(after);
    setMention(null);
    emit();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (mention && matches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); setMention({ ...mention, active: (mention.active + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length }); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); pick(matches[mention.active] ?? matches[0]); return; }
    }
    if (mention && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMention(null); return; }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && onSubmit) { e.preventDefault(); onSubmit(); return; }
    if (e.key === "Tab") {
      // Tab nests list items (and indents paragraphs); Shift+Tab outdents. Without a list, leave Tab for focus navigation.
      const inList = state.insertUnorderedList || state.insertOrderedList;
      if (inList || !e.shiftKey) { e.preventDefault(); exec(e.shiftKey ? "outdent" : "indent", undefined, !inList); }
    }
    // Typing must not trigger page shortcuts (the board's grid keys), but Esc still reaches the window to close it.
    if (e.key !== "Escape") e.stopPropagation();
  };
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    if (html) document.execCommand("insertHTML", false, sanitizeRich(html.replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, "")));
    else document.execCommand("insertText", false, text);
    emit();
  };

  return (
    <div className={cn("flex min-w-0 flex-col rounded-neo neo-inset-sm", fill && "h-full")}>
      {!readOnly && (
        <div role="toolbar" aria-label={`${label} formatting`} className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-neo border-b border-hairline/60 bg-sunken/60 px-1.5 py-1 backdrop-blur-sm">
          <ToolBtn tip="Undo (Ctrl+Z)" onClick={() => exec("undo")}><Undo2 className="h-3.5 w-3.5" /></ToolBtn>
          <ToolBtn tip="Redo (Ctrl+Y)" onClick={() => exec("redo")}><Redo2 className="h-3.5 w-3.5" /></ToolBtn>
          <ToolSep />
          <ToolBtn tip="Paragraph" on={block === "p" || block === "div"} onClick={() => heading("p")}><Pilcrow className="h-3.5 w-3.5" /></ToolBtn>
          <ToolBtn tip="Heading" on={block === "h2"} onClick={() => heading("h2")}><Heading2 className="h-3.5 w-3.5" /></ToolBtn>
          <ToolBtn tip="Subheading" on={block === "h3"} onClick={() => heading("h3")}><Heading3 className="h-3.5 w-3.5" /></ToolBtn>
          <ToolSep />
          <ToolBtn tip="Bold (Ctrl+B)" on={state.bold} onClick={() => toggle("bold")}><Bold className="h-3.5 w-3.5" /></ToolBtn>
          <ToolBtn tip="Italic (Ctrl+I)" on={state.italic} onClick={() => toggle("italic")}><Italic className="h-3.5 w-3.5" /></ToolBtn>
          <ToolBtn tip="Underline (Ctrl+U)" on={state.underline} onClick={() => toggle("underline")}><Underline className="h-3.5 w-3.5" /></ToolBtn>
          <Swatches tip="Text colour" icon={<Baseline className="h-3.5 w-3.5" />} items={TEXT_COLOURS} kind="text" onPick={(v) => exec("foreColor", v, true)} />
          <Swatches tip="Highlight" icon={<Highlighter className="h-3.5 w-3.5" />} items={HIGHLIGHTS} kind="bg" onPick={(v) => exec("hiliteColor", v, true)} onClear={() => exec("hiliteColor", "transparent", true)} />
          <ToolSep />
          <ToolBtn tip="Bulleted list" on={state.insertUnorderedList} onClick={() => toggle("insertUnorderedList")}><List className="h-3.5 w-3.5" /></ToolBtn>
          <ToolBtn tip="Numbered list" on={state.insertOrderedList} onClick={() => toggle("insertOrderedList")}><ListOrdered className="h-3.5 w-3.5" /></ToolBtn>
          <ToolBtn tip="Decrease indent (Shift+Tab)" onClick={() => exec("outdent", undefined, !(state.insertUnorderedList || state.insertOrderedList))}><IndentDecrease className="h-3.5 w-3.5" /></ToolBtn>
          <ToolBtn tip="Increase indent (Tab)" onClick={() => exec("indent", undefined, !(state.insertUnorderedList || state.insertOrderedList))}><IndentIncrease className="h-3.5 w-3.5" /></ToolBtn>
          <ToolSep />
          <ToolBtn tip="Clear formatting" onClick={() => { exec("removeFormat"); exec("formatBlock", "<p>"); }}><Eraser className="h-3.5 w-3.5" /></ToolBtn>
          {mentionable && <><ToolSep /><ToolBtn tip="Mention a teammate (type @)" onClick={() => { ref.current?.focus(); document.execCommand("insertText", false, (window.getSelection()?.anchorOffset ? " " : "") + "@"); emit(); detectMention(); }}><AtSign className="h-3.5 w-3.5" /></ToolBtn></>}
          {onExpand && <span className="ml-auto"><ToolBtn tip="Expand: a larger window to read and edit" onClick={onExpand}><Maximize2 className="h-3.5 w-3.5" /></ToolBtn></span>}
        </div>
      )}
      <div
        ref={ref} role="textbox" aria-multiline aria-label={label} contentEditable={!readOnly} suppressContentEditableWarning data-placeholder={placeholder}
        onInput={() => { emit(); detectMention(); }} onKeyDown={onKeyDown} onPaste={onPaste} onBlur={() => { emit(); setTimeout(() => setMention(null), 150); }} onKeyUp={refresh} onMouseUp={refresh}
        className={cn("rich-note rich-editor min-h-0 overflow-y-auto overscroll-contain", compact ? "px-3 py-2" : "px-4 py-3", fill && "flex-1")}
        style={{ minHeight, maxHeight: fill ? undefined : maxHeight }}
      />
      {mention && typeof document !== "undefined" && createPortal(
        <div role="listbox" aria-label="Mention a teammate" style={{ top: mention.top, left: mention.left }} className="fixed z-[80] w-64 rounded-neo bg-canvas p-1.5 neo-raised">
          {matches.length ? matches.map((m, i) => (
            <button key={m.id} type="button" role="option" aria-selected={i === mention.active} onMouseDown={(e) => { e.preventDefault(); pick(m); }}
              className={cn("flex w-full flex-col rounded-neo-sm px-2.5 py-1.5 text-left", i === mention.active ? "bg-sunken/80" : "hover:bg-sunken/60")}>
              <span className="text-xs font-medium text-ink">{m.name}</span>{m.email && <span className="truncate text-[0.6875rem] text-ink-3">{m.email}</span>}
            </button>
          )) : <p className="px-2.5 py-1.5 text-xs text-ink-3">{members.length ? "No teammate matches" : "Loading teammates…"}</p>}
          <p className="border-t border-hairline px-2.5 pt-1.5 text-[0.625rem] text-ink-3">↑ ↓ to choose · Enter to mention · they get notified</p>
        </div>, document.body)}
    </div>
  );
}

function ToolBtn({ on, tip, onClick, children, disabled }: { on?: boolean; tip: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Tip content={tip}>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled} aria-label={tip} aria-pressed={on}
        className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-35", on ? "bg-canvas text-oxblood neo-raised-sm" : "text-ink-2 hover:bg-raised/80 hover:text-ink")}>{children}</button>
    </Tip>
  );
}
const ToolSep = () => <span className="mx-0.5 h-4 w-px shrink-0 bg-hairline" aria-hidden />;

function Swatches({ tip, icon, items, kind, onPick, onClear }: { tip: string; icon: React.ReactNode; items: { name: string; value: string }[]; kind: "text" | "bg"; onPick: (v: string) => void; onClear?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tip content={tip}>
        <Popover.Trigger asChild>
          <button type="button" onMouseDown={(e) => e.preventDefault()} aria-label={tip} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-raised/80 hover:text-ink data-[state=open]:bg-canvas data-[state=open]:neo-raised-sm">{icon}</button>
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Content data-rich-popover sideOffset={6} onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()} className="z-[70] rounded-neo bg-canvas p-2 neo-raised">
          <p className="mb-1.5 px-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-3">{tip}</p>
          <div className="flex items-center gap-1.5">
            {items.map((c) => (
              <Tip key={c.value} content={c.name}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c.value); setOpen(false); }} aria-label={`${tip}: ${c.name}`}
                  className="grid h-7 w-7 place-items-center rounded-full ring-1 ring-hairline hover:ring-2 hover:ring-oxblood/40">
                  <span className={cn("h-4 w-4 rounded-full", kind === "text" && "ring-1 ring-ivory/40")} style={{ backgroundColor: c.value }} />
                </button>
              </Tip>
            ))}
            {onClear && (
              <Tip content="No highlight">
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onClear(); setOpen(false); }} aria-label="Remove highlight" className="grid h-7 w-7 place-items-center rounded-full text-ink-3 ring-1 ring-hairline hover:text-ink"><X className="h-3.5 w-3.5" /></button>
              </Tip>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Read a note: rich or legacy plain text, safely rendered. Long notes show in full up to `clampHeight`; beyond that
 * they fade with a "Show all" toggle, plus Expand for a large reading window.
 */
export function RichView({ body, clampHeight = 320, title, className }: { body: string; clampHeight?: number; title?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const html = toSafeHtml(body);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTall(el.scrollHeight > clampHeight + 24);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [html, clampHeight]);
  return (
    <div className={cn("min-w-0", className)}>
      <div className="relative">
        <div ref={ref} className="rich-note" style={!open && tall ? { maxHeight: clampHeight, overflow: "hidden" } : undefined} dangerouslySetInnerHTML={{ __html: html }} />
        {!open && tall && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[var(--surface-primary)] to-transparent" aria-hidden />}
      </div>
      {(tall || title) && (
        <div className="mt-1.5 flex items-center gap-3 text-[0.6875rem]">
          {tall && <button type="button" onClick={() => setOpen((o) => !o)} className="font-medium text-oxblood hover:underline">{open ? "Collapse" : "Show all"}</button>}
          <button type="button" onClick={() => setReading(true)} className="inline-flex items-center gap-1 text-ink-3 hover:text-oxblood"><Maximize2 className="h-3 w-3" aria-hidden />Expand</button>
        </div>
      )}
      <Dialog.Root open={reading} onOpenChange={setReading}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-[#14141433] backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] flex max-h-[88dvh] w-[min(calc(100vw-2rem),900px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-neo-lg bg-canvas neo-raised-lg">
            <div className="flex items-center gap-3 border-b border-hairline/70 px-6 py-3">
              <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{title ?? "Note"}</Dialog.Title>
              <Dialog.Description className="sr-only">Reading view</Dialog.Description>
              <Dialog.Close className="grid h-8 w-8 place-items-center rounded-full neo-raised-sm text-ink-2 hover:text-oxblood" aria-label="Close"><X className="h-4 w-4" /></Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6"><div className="rich-note mx-auto max-w-[72ch] text-[0.9375rem]" dangerouslySetInnerHTML={{ __html: html }} /></div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
