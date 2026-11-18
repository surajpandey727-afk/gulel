/**
 * Rich notes: stored as a small, safe subset of HTML; older notes are plain text and keep working.
 * Pure string code (no DOM), so the same sanitiser runs on the server before saving and in the browser before rendering.
 */

const BLOCK_START = /^\s*<(p|h[1-6]|ul|ol|div|blockquote)[\s>]/i;
/** True when a stored note body is rich (HTML) rather than legacy plain text. */
export const isRich = (body: string | null | undefined) => !!body && BLOCK_START.test(body);

const ALLOWED = new Set(["p", "br", "strong", "em", "u", "s", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "span", "mark", "a", "div"]);
const RENAME: Record<string, string> = { b: "strong", i: "em", strike: "s", del: "s", h1: "h2", h5: "h4", h6: "h4", font: "span", ins: "u" };
const VOID = new Set(["br"]);
const STYLED = new Set(["span", "mark", "p", "li", "h2", "h3", "h4", "div", "blockquote", "ul", "ol"]);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math|textarea|select|head|title)\b[\s\S]*?(<\/\1\s*>|$)/gi;

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;

const escText = (t: string) => t.replace(/&(?!(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/** Browsers rewrite colours as rgb()/rgba(); store them as lowercase hex so they stay stable and theme-mappable. */
function toHex(v: string): string {
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v.trim());
  if (!m) return v.toLowerCase();
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  const a = m[4] === undefined ? 1 : Number(m[4]);
  return `#${h(+m[1])}${h(+m[2])}${h(+m[3])}${a < 1 ? h(a * 255) : ""}`;
}

/** The editor's own inline styles, normalised the same way the sanitiser stores them. */
export const normaliseStyle = (style: string) => cleanStyle(style, {});

function cleanStyle(style: string, extra: Record<string, string>): string {
  const keep: string[] = [];
  const decl = new Map<string, string>();
  for (const part of style.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    decl.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim());
  }
  for (const [k, v] of Object.entries(extra)) if (!decl.has(k)) decl.set(k, v);
  for (const [k, v] of decl) {
    if ((k === "color" || k === "background-color") && COLOR.test(v)) keep.push(`${k}: ${toHex(v)}`);
    else if ((k === "margin-left" || k === "padding-left") && /^\d{1,3}(px|em|rem)$/.test(v)) keep.push(`margin-left: ${v}`);
    else if (k === "text-decoration" || k === "text-decoration-line") { if (/underline/.test(v)) keep.push("text-decoration: underline"); else if (/line-through/.test(v)) keep.push("text-decoration: line-through"); }
    else if (k === "font-weight" && /^(bold|[6-9]00)$/.test(v)) keep.push("font-weight: 600");
    else if (k === "font-style" && v === "italic") keep.push("font-style: italic");
  }
  return keep.join("; ");
}

/** Keep only safe formatting: the tags the editor produces, colour/highlight/indent styles, and http(s)/mailto links. */
export function sanitizeRich(html: string): string {
  const src = String(html ?? "").replace(/<!--[\s\S]*?-->/g, "").replace(DROP_WITH_CONTENT, "");
  const out: string[] = [];
  const stack: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|<|[^<]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const tok = m[0];
    if (tok === "<") { out.push("&lt;"); continue; }
    if (!m[1]) { out.push(escText(tok)); continue; }
    const closing = tok.startsWith("</");
    let name = m[1].toLowerCase();
    const a = closing ? {} : attrs(m[2] ?? "");
    const fontColor: Record<string, string> = name === "font" && a.color && COLOR.test(a.color) ? { color: a.color } : {};
    name = RENAME[name] ?? name;
    if (!ALLOWED.has(name)) continue;
    if (closing) {
      const at = Math.max(stack.lastIndexOf(name), stack.lastIndexOf(`~${name}`));
      if (at < 0) continue;
      while (stack.length > at) { const t = stack.pop()!; if (!t.startsWith("~")) out.push(`</${t}>`); }
      continue;
    }
    if (VOID.has(name)) { out.push(`<${name}>`); continue; }
    let attr = "";
    if (name === "a") {
      const href = (a.href ?? "").trim();
      if (!/^(https?:\/\/|mailto:)/i.test(href)) continue; // drop the tag, keep its text
      attr = ` href="${escAttr(href)}" target="_blank" rel="noopener noreferrer nofollow"`;
    } else if (name === "span" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a["data-mention"] ?? "")) {
      attr = ` data-mention="${a["data-mention"].toLowerCase()}"`; // @mention of a teammate
    } else if (STYLED.has(name)) {
      const style = cleanStyle(a.style ?? "", fontColor);
      if (style) attr = ` style="${escAttr(style)}"`;
      else if (name === "span") { stack.push("~span"); continue; } // a bare span adds nothing: keep its text only
    }
    out.push(`<${name}${attr}>`);
    stack.push(name);
    if (/^\s*\/\s*$/.test(m[2] ?? "")) out.push(`</${stack.pop()}>`); // self-closed
  }
  while (stack.length) { const t = stack.pop()!; if (!t.startsWith("~")) out.push(`</${t}>`); }
  return out.join("").replace(/<(span|mark|strong|em|u|s)>\s*<\/\1>/g, "").trim();
}

/** Plain text (for search, AI context, previews and the Google Sheet). Lists keep bullets; headings keep their own line. */
export function richToText(body: string | null | undefined): string {
  const s = String(body ?? "");
  if (!isRich(s)) return s.trim();
  // Number ordered-list items per list; nested lists keep their own count and indent.
  const lists: { ordered: boolean; n: number }[] = [];
  const marked = s.replace(/<(\/?)(ol|ul|li)\b[^>]*>/gi, (_m, close: string, tag: string) => {
    const t = tag.toLowerCase();
    if (t === "li") {
      if (close) return "";
      const l = lists[lists.length - 1];
      return `\n${"  ".repeat(Math.max(0, lists.length - 1))}${l?.ordered ? `${++l.n}.` : "•"} `;
    }
    if (close) { lists.pop(); return "\n"; }
    lists.push({ ordered: t === "ol", n: 0 });
    return "\n";
  });
  return marked
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Legacy plain text as rich HTML (paragraphs and line breaks), for display and for editing in the rich editor. */
export function textToRich(text: string): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return String(text ?? "").replace(/\r/g, "").split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/** Any stored body (rich or plain) as safe HTML for rendering. */
export const toSafeHtml = (body: string | null | undefined) => (isRich(body) ? sanitizeRich(String(body)) : textToRich(String(body ?? "")));

/** Normalise what the editor sends before saving: sanitised HTML, or "" when there is no visible text. */
export function normaliseRichInput(body: string): string {
  const clean = sanitizeRich(body);
  return richToText(clean).trim() ? (isRich(clean) ? clean : `<p>${clean}</p>`) : "";
}
