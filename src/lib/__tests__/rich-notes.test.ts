import { describe, expect, it } from "vitest";
import { isRich, normaliseRichInput, richToText, sanitizeRich, textToRich, toSafeHtml } from "@/lib/notes/rich";

describe("rich notes sanitiser", () => {
  it("keeps editor formatting", () => {
    const html = '<h2>Brief</h2><p><strong>Bold</strong> <em>it</em> <u>u</u></p><ul><li>One<ul><li>Nested</li></ul></li></ul><ol><li>First</li></ol>';
    expect(sanitizeRich(html)).toBe(html);
  });
  it("keeps colour, highlight and indent but nothing else in style", () => {
    expect(sanitizeRich('<p style="margin-left: 40px; position:fixed"><span style="color: rgb(122, 31, 43); background-color: #fff3c4; width: 9999px">x</span></p>'))
      .toBe('<p style="margin-left: 40px"><span style="color: #7a1f2b; background-color: #fff3c4">x</span></p>');
  });
  it("removes scripts, handlers and unsafe links", () => {
    const out = sanitizeRich('<p onclick="alert(1)">a<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">l</a><a href="https://x.com" onmouseover="y">ok</a></p><style>p{}</style>');
    expect(out).toBe('<p>al<a href="https://x.com" target="_blank" rel="noopener noreferrer nofollow">ok</a></p>');
    expect(out).not.toMatch(/script|onerror|onclick|javascript/i);
  });
  it("escapes stray angle brackets and balances tags", () => {
    expect(sanitizeRich("<p>1 < 2 & <strong>bold</p>")).toBe("<p>1 &lt; 2 &amp; <strong>bold</strong></p>");
    expect(sanitizeRich('<p>"x" <b>y</b></p></div>')).toBe('<p>"x" <strong>y</strong></p>');
  });
  it("blocks attribute breakout and style url()", () => {
    expect(sanitizeRich('<span style="color: red; background: url(javascript:x)">t</span>')).toBe("t");
    expect(sanitizeRich('<a href="https://a.com/&quot;onmouseover=&quot;x">t</a>')).toContain('href="https://a.com/&amp;quot;onmouseover=&amp;quot;x"');
  });
  it("converts to plain text with bullets and numbers", () => {
    expect(richToText("<h2>Title</h2><p>Para one</p><ul><li>a</li><li>b</li></ul><ol><li>x</li><li>y</li></ol>")).toBe("Title\nPara one\n\n• a\n• b\n\n1. x\n2. y");
  });
  it("treats legacy plain text as plain", () => {
    expect(isRich("Called them <today>")).toBe(false);
    expect(toSafeHtml("a <b>\n\nb")).toBe("<p>a &lt;b&gt;</p><p>b</p>");
    expect(textToRich("l1\nl2")).toBe("<p>l1<br>l2</p>");
  });
  it("empty editor content normalises to empty", () => {
    expect(normaliseRichInput("<p><br></p>")).toBe("");
    expect(normaliseRichInput("plain")).toBe("<p>plain</p>");
  });
});

describe("rich notes colours", () => {
  it("stores rgba highlights as 8-digit hex", () => {
    expect(sanitizeRich('<span style="background-color: rgba(224, 178, 103, 0.35)">h</span>')).toBe('<span style="background-color: #e0b26759">h</span>');
  });
});
