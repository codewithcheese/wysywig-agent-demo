import { describe, it, expect } from 'vitest';
import { sanitize, sanitizeHtml, sanitizeCss } from './sanitizer.js';

describe('sanitizeHtml', () => {
  it('removes script tags', () => {
    const html = '<div>Hello</div><script>alert("xss")</script>';
    const result = sanitizeHtml(html);
    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('Hello');
    expect(result.stats.scripts).toBe(1);
  });

  it('removes inline event handlers', () => {
    const html = '<button onclick="alert(1)">Click</button>';
    const result = sanitizeHtml(html);
    expect(result.html).not.toContain('onclick');
    expect(result.html).toContain('Click');
    expect(result.stats.handlers).toBe(1);
  });

  it('removes javascript: URLs', () => {
    const html = '<a href="javascript:alert(1)">Link</a>';
    const result = sanitizeHtml(html);
    expect(result.html).not.toContain('javascript:');
    expect(result.stats.unsafeUrls).toBe(1);
  });

  it('preserves data-gjs-* attributes', () => {
    const html = '<div data-gjs-id="abc" data-gjs-type="text">Content</div>';
    const result = sanitizeHtml(html, { preserveDataAttributes: true });
    expect(result.html).toContain('data-gjs-id="abc"');
    expect(result.html).toContain('data-gjs-type="text"');
  });

  it('preserves normal HTML structure', () => {
    const html = `
      <section id="hero" class="main-section">
        <h1>Title</h1>
        <p>Paragraph</p>
      </section>
    `;
    const result = sanitizeHtml(html);
    expect(result.html).toContain('<section');
    expect(result.html).toContain('<h1>');
    expect(result.html).toContain('Title');
    expect(result.html).toContain('<p>');
  });

  it('handles multiple event handlers', () => {
    const html = '<div onmouseover="x()" onmouseout="y()" onclick="z()">Test</div>';
    const result = sanitizeHtml(html);
    expect(result.html).not.toContain('onmouseover');
    expect(result.html).not.toContain('onmouseout');
    expect(result.html).not.toContain('onclick');
    expect(result.stats.handlers).toBe(3);
  });
});

describe('sanitizeCss', () => {
  it('removes remote @import statements', () => {
    const css = `
      @import url("https://evil.com/malware.css");
      body { color: red; }
    `;
    const result = sanitizeCss(css, { allowRemoteImports: false });
    expect(result.css).not.toContain('evil.com');
    expect(result.css).toContain('color: red');
    expect(result.stats.remoteImports).toBe(1);
  });

  it('removes javascript: URLs in CSS', () => {
    const css = 'div { background: url(javascript:alert(1)); }';
    const result = sanitizeCss(css);
    expect(result.css).not.toContain('javascript:');
    expect(result.css).toContain('url(about:blank)');
  });

  it('removes expression() calls', () => {
    const css = 'div { width: expression(document.body.clientWidth); }';
    const result = sanitizeCss(css);
    expect(result.css).not.toContain('expression');
  });

  it('removes -moz-binding', () => {
    const css = 'div { -moz-binding: url("http://evil.com/xss.xml"); }';
    const result = sanitizeCss(css);
    expect(result.css).not.toContain('-moz-binding');
  });

  it('preserves safe CSS', () => {
    const css = `
      .container { max-width: 1200px; margin: 0 auto; }
      h1 { font-size: 2em; color: #333; }
    `;
    const result = sanitizeCss(css);
    expect(result.css).toContain('max-width: 1200px');
    expect(result.css).toContain('font-size: 2em');
  });
});

describe('sanitize (full pipeline)', () => {
  it('sanitizes both HTML and CSS', () => {
    const html = '<div onclick="bad()">Content</div><script>evil()</script>';
    const css = '@import url("https://evil.com/bad.css"); body { color: red; }';

    const result = sanitize(html, css);

    expect(result.sanitizedHtml).not.toContain('onclick');
    expect(result.sanitizedHtml).not.toContain('<script>');
    expect(result.sanitizedCss).not.toContain('evil.com');
    expect(result.removed.scripts).toBe(1);
    expect(result.removed.handlers).toBe(1);
    expect(result.removed.remoteImports).toBe(1);
  });

  it('passes when no dangerous content', () => {
    const html = '<div data-gjs-id="abc"><h1>Hello</h1></div>';
    const css = 'h1 { color: blue; }';

    const result = sanitize(html, css);

    expect(result.passed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('fails when dangerous content removed', () => {
    // Use event handlers which are reliably counted by the sanitizer
    const html = '<div onclick="alert(1)">Content</div>';
    const css = '';

    const result = sanitize(html, css);

    expect(result.passed).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.removed.handlers).toBe(1);
  });
});
