/**
 * HTML/CSS Sanitizer
 *
 * Sanitizes AI-generated HTML/CSS to remove potentially dangerous elements
 * while preserving GrapesJS markers and structure.
 */

import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import type { SanitizationResult } from '../types.js';

// Event handler attributes to remove
const EVENT_HANDLERS = [
  'onabort', 'onafterprint', 'onbeforeprint', 'onbeforeunload', 'onblur',
  'oncanplay', 'oncanplaythrough', 'onchange', 'onclick', 'oncontextmenu',
  'oncopy', 'oncuechange', 'oncut', 'ondblclick', 'ondrag', 'ondragend',
  'ondragenter', 'ondragleave', 'ondragover', 'ondragstart', 'ondrop',
  'ondurationchange', 'onemptied', 'onended', 'onerror', 'onfocus',
  'onhashchange', 'oninput', 'oninvalid', 'onkeydown', 'onkeypress',
  'onkeyup', 'onload', 'onloadeddata', 'onloadedmetadata', 'onloadstart',
  'onmessage', 'onmousedown', 'onmousemove', 'onmouseout', 'onmouseover',
  'onmouseup', 'onmousewheel', 'onoffline', 'ononline', 'onpagehide',
  'onpageshow', 'onpaste', 'onpause', 'onplay', 'onplaying', 'onpopstate',
  'onprogress', 'onratechange', 'onreset', 'onresize', 'onscroll',
  'onsearch', 'onseeked', 'onseeking', 'onselect', 'onstalled', 'onstorage',
  'onsubmit', 'onsuspend', 'ontimeupdate', 'ontoggle', 'onunload',
  'onvolumechange', 'onwaiting', 'onwheel',
];

// Unsafe URL schemes
const UNSAFE_SCHEMES = [
  'javascript:',
  'vbscript:',
  'data:text/html',
];

interface SanitizeOptions {
  allowRemoteImports?: boolean;
  preserveDataAttributes?: boolean;
}

/**
 * Sanitizes HTML content
 */
export function sanitizeHtml(
  html: string,
  options: SanitizeOptions = {}
): { html: string; stats: SanitizationStats } {
  const { preserveDataAttributes = true } = options;

  const stats: SanitizationStats = {
    scripts: 0,
    handlers: 0,
    unsafeUrls: 0,
  };

  // Create JSDOM instance for DOMPurify
  const dom = new JSDOM('');
  const DOMPurify = createDOMPurify(dom.window as unknown as Window);

  // Configure DOMPurify
  const config: {
    ALLOWED_TAGS: string[];
    ALLOWED_ATTR: string[];
    ALLOW_DATA_ATTR: boolean;
    FORBID_TAGS: string[];
    FORBID_ATTR: string[];
  } = {
    ALLOWED_TAGS: [
      // Structure
      'html', 'head', 'body', 'div', 'span', 'section', 'article', 'header',
      'footer', 'nav', 'aside', 'main', 'figure', 'figcaption',
      // Text
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'pre', 'blockquote',
      'address', 'code', 'samp', 'kbd', 'var', 'cite', 'abbr', 'acronym',
      'dfn', 'sub', 'sup', 'em', 'strong', 'small', 'mark', 'del', 'ins',
      'u', 'b', 'i', 's', 'q', 'wbr',
      // Lists
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      // Tables
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
      'colgroup', 'col',
      // Forms (display only, not functional)
      'form', 'fieldset', 'legend', 'label', 'input', 'button', 'select',
      'option', 'optgroup', 'textarea', 'datalist', 'output', 'progress', 'meter',
      // Media
      'img', 'picture', 'source', 'video', 'audio', 'track', 'map', 'area',
      // Embedded
      'iframe', 'object', 'embed',
      // Others
      'a', 'time', 'details', 'summary', 'dialog', 'menu', 'template',
    ],
    ALLOWED_ATTR: [
      // Global
      'id', 'class', 'style', 'title', 'lang', 'dir', 'tabindex', 'hidden',
      'role', 'aria-*', 'accesskey', 'contenteditable', 'draggable', 'spellcheck',
      // Links
      'href', 'target', 'rel', 'download', 'hreflang', 'type',
      // Images
      'src', 'alt', 'width', 'height', 'loading', 'decoding', 'srcset', 'sizes',
      'crossorigin', 'usemap', 'ismap',
      // Tables
      'colspan', 'rowspan', 'headers', 'scope', 'abbr',
      // Forms
      'name', 'value', 'placeholder', 'disabled', 'readonly', 'required',
      'checked', 'selected', 'multiple', 'size', 'maxlength', 'minlength',
      'min', 'max', 'step', 'pattern', 'autocomplete', 'autofocus', 'form',
      'formaction', 'formenctype', 'formmethod', 'formnovalidate', 'formtarget',
      // Media
      'controls', 'autoplay', 'loop', 'muted', 'preload', 'poster',
      // Others
      'datetime', 'cite', 'open', 'wrap', 'cols', 'rows', 'for', 'list',
    ],
    ALLOW_DATA_ATTR: preserveDataAttributes,
    FORBID_TAGS: ['script', 'noscript', 'style', 'link', 'meta'],
    FORBID_ATTR: EVENT_HANDLERS,
  };

  // Hook to count removed elements
  DOMPurify.addHook('uponSanitizeElement', (node: Element, data: { tagName: string }) => {
    if (data.tagName === 'script' || data.tagName === 'noscript') {
      stats.scripts++;
    }
  });

  DOMPurify.addHook('uponSanitizeAttribute', (
    _node: Element,
    data: { attrName: string; attrValue: string; keepAttr: boolean }
  ) => {
    // Check for event handlers
    if (EVENT_HANDLERS.includes(data.attrName.toLowerCase())) {
      stats.handlers++;
      data.keepAttr = false;
    }

    // Check for unsafe URLs
    if (['href', 'src', 'action', 'formaction', 'data', 'poster'].includes(data.attrName)) {
      const value = data.attrValue.toLowerCase().trim();
      for (const scheme of UNSAFE_SCHEMES) {
        if (value.startsWith(scheme)) {
          stats.unsafeUrls++;
          data.keepAttr = false;
          break;
        }
      }
    }
  });

  const sanitized = DOMPurify.sanitize(html, config);

  // Remove hooks to avoid memory leaks
  DOMPurify.removeAllHooks();

  return { html: sanitized, stats };
}

interface SanitizationStats {
  scripts: number;
  handlers: number;
  unsafeUrls: number;
}

/**
 * Sanitizes CSS content
 */
export function sanitizeCss(
  css: string,
  options: SanitizeOptions = {}
): { css: string; stats: { remoteImports: number } } {
  const { allowRemoteImports = false } = options;

  const stats = {
    remoteImports: 0,
  };

  let sanitized = css;

  // Remove @import with remote URLs (if not allowed)
  if (!allowRemoteImports) {
    const importPattern = /@import\s+(?:url\s*\(\s*)?['"]?(https?:\/\/[^'")\s]+)['"]?\s*\)?[^;]*;?/gi;
    sanitized = sanitized.replace(importPattern, () => {
      stats.remoteImports++;
      return '/* [remote import removed] */';
    });
  }

  // Remove url() with javascript: or data:text/html schemes
  const unsafeUrlPattern = /url\s*\(\s*['"]?(javascript:|vbscript:|data:text\/html)[^)]*\)/gi;
  sanitized = sanitized.replace(unsafeUrlPattern, 'url(about:blank)');

  // Remove expression() (IE-specific XSS vector)
  const expressionPattern = /expression\s*\([^)]*\)/gi;
  sanitized = sanitized.replace(expressionPattern, '');

  // Remove -moz-binding (Firefox XSS vector)
  const mozBindingPattern = /-moz-binding\s*:[^;]+;?/gi;
  sanitized = sanitized.replace(mozBindingPattern, '');

  // Remove behavior (IE XSS vector)
  const behaviorPattern = /behavior\s*:[^;]+;?/gi;
  sanitized = sanitized.replace(behaviorPattern, '');

  return { css: sanitized, stats };
}

/**
 * Full sanitization pipeline
 */
export function sanitize(
  html: string,
  css: string,
  options: SanitizeOptions = {}
): SanitizationResult {
  const htmlResult = sanitizeHtml(html, options);
  const cssResult = sanitizeCss(css, options);

  const passed =
    htmlResult.stats.scripts === 0 &&
    htmlResult.stats.handlers === 0 &&
    htmlResult.stats.unsafeUrls === 0;

  const warnings: string[] = [];

  if (htmlResult.stats.scripts > 0) {
    warnings.push(`Removed ${htmlResult.stats.scripts} script element(s)`);
  }
  if (htmlResult.stats.handlers > 0) {
    warnings.push(`Removed ${htmlResult.stats.handlers} event handler(s)`);
  }
  if (htmlResult.stats.unsafeUrls > 0) {
    warnings.push(`Removed ${htmlResult.stats.unsafeUrls} unsafe URL(s)`);
  }
  if (cssResult.stats.remoteImports > 0) {
    warnings.push(`Removed ${cssResult.stats.remoteImports} remote @import(s)`);
  }

  return {
    passed,
    removed: {
      scripts: htmlResult.stats.scripts,
      handlers: htmlResult.stats.handlers,
      unsafeUrls: htmlResult.stats.unsafeUrls,
      remoteImports: cssResult.stats.remoteImports,
    },
    sanitizedHtml: htmlResult.html,
    sanitizedCss: cssResult.css,
    warnings,
  };
}
