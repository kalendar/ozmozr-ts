import { expect, test } from "vitest";
import { htmlToText, sanitizeHtml } from "./sanitize";

const base = "https://blog.example/posts/1";

test("removes scripts, iframes, styles, event handlers and javascript: links", () => {
  const dirty =
    '<p onclick="steal()">Hi</p><script>alert(1)</script><iframe src="https://evil.example"></iframe>' +
    '<style>p{color:red}</style><a href="javascript:alert(1)">x</a><img src="x" onerror="alert(1)">';
  const clean = sanitizeHtml(dirty, base);
  expect(clean).not.toMatch(/script|iframe|style|onclick|onerror|javascript:|alert/i);
  expect(clean).toContain("<p>Hi</p>");
});

test("keeps ordinary article markup", () => {
  const html =
    "<h2>T</h2><h3>S</h3><h4>U</h4><p>a <em>b</em> <strong>c</strong></p><blockquote>q</blockquote>" +
    "<ul><li>1</li></ul><ol><li>2</li></ol><pre><code>x</code></pre>";
  expect(sanitizeHtml(html, base)).toBe(html);
});

test("resolves relative links and images against the base url", () => {
  const clean = sanitizeHtml('<a href="/about">a</a><img src="pic.png" alt="p">', base);
  expect(clean).toContain('href="https://blog.example/about"');
  expect(clean).toContain('src="https://blog.example/posts/pic.png"');
});

test("links open in a new tab and are marked untrusted", () => {
  const clean = sanitizeHtml('<a href="https://x.example/">x</a>', base);
  expect(clean).toContain('rel="noopener nofollow ugc"');
  expect(clean).toContain('target="_blank"');
});

test("drops data: and other unexpected url schemes", () => {
  const clean = sanitizeHtml('<a href="data:text/html,<script>1</script>">x</a><img src="vbscript:x">', base);
  expect(clean).not.toMatch(/data:|vbscript:/);
});

test("htmlToText strips tags and decodes entities", () => {
  expect(htmlToText("<p>Hi <b>there</b></p>")).toBe("Hi there");
  expect(htmlToText("<p>Tom &amp; Jerry&nbsp;&lt;3</p><script>x()</script>")).toBe("Tom & Jerry <3");
});

test("htmlToText cuts long text with an ellipsis", () => {
  const text = htmlToText(`<p>${"word ".repeat(200)}</p>`);
  expect(text.length).toBeLessThanOrEqual(300);
  expect(text.endsWith("…")).toBe(true);
  expect(htmlToText("<p>short</p>", 10)).toBe("short");
});
