/**
 * Headless GrapesJS Engine
 *
 * Provides load/export/import capabilities for GrapesJS projects
 * without requiring a browser environment.
 */

import { JSDOM } from 'jsdom';
import type {
  GrapesJSProject,
  ExportResult,
  ExportOptions,
  ImportResult,
} from '../types.js';

// GrapesJS type (loaded dynamically)
type GrapesJSEditor = {
  getHtml: (opts?: { cleanId?: boolean }) => string;
  getCss: (opts?: { avoidProtected?: boolean }) => string;
  setComponents: (components: unknown) => void;
  addComponents: (components: unknown) => void;
  getComponents: () => unknown[];
  setStyle: (styles: unknown) => void;
  getStyle: () => unknown[];
  loadProjectData: (data: unknown) => void;
  getProjectData: () => unknown;
  runCommand: (command: string, options?: unknown) => unknown;
  DomComponents: {
    getTypes: () => { id: string }[];
    addType: (id: string, definition: unknown) => void;
    getWrapper: () => unknown;
  };
  destroy: () => void;
};

// Store for the JSDOM instance to reuse
let domInstance: JSDOM | null = null;

/**
 * Creates a JSDOM environment for headless GrapesJS
 */
function getDOM(): JSDOM {
  if (!domInstance) {
    domInstance = new JSDOM('<!DOCTYPE html><html><body><div id="gjs"></div></body></html>', {
      url: 'http://localhost',
      pretendToBeVisual: true,
      runScripts: 'dangerously',
    });

    // Polyfill required browser APIs
    const { window } = domInstance;

    // Minimal polyfills for GrapesJS
    if (!window.requestAnimationFrame) {
      (window as unknown as Record<string, unknown>).requestAnimationFrame = (cb: () => void) =>
        setTimeout(cb, 16);
    }
    if (!window.cancelAnimationFrame) {
      (window as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
        clearTimeout(id);
    }
    if (!window.matchMedia) {
      (window as unknown as Record<string, unknown>).matchMedia = () => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      });
    }

    // Set globals
    (global as unknown as Record<string, unknown>).window = window;
    (global as unknown as Record<string, unknown>).document = window.document;
    (global as unknown as Record<string, unknown>).navigator = window.navigator;
    (global as unknown as Record<string, unknown>).HTMLElement = window.HTMLElement;
    (global as unknown as Record<string, unknown>).Element = window.Element;
    (global as unknown as Record<string, unknown>).Node = window.Node;
    (global as unknown as Record<string, unknown>).Text = window.Text;
    (global as unknown as Record<string, unknown>).getComputedStyle = window.getComputedStyle;
  }
  return domInstance;
}

/**
 * Creates a headless GrapesJS editor instance
 */
async function createEditor(config?: {
  registerCustomComponents?: boolean;
}): Promise<GrapesJSEditor> {
  getDOM();

  // Dynamic import of grapesjs
  const grapesjs = await import('grapesjs');

  const editor = grapesjs.default.init({
    container: '#gjs',
    headless: true,
    storageManager: false,
    deviceManager: { devices: [] },
    plugins: [],
    canvas: {
      scripts: [],
      styles: [],
    },
  }) as unknown as GrapesJSEditor;

  // Register custom component types if requested
  if (config?.registerCustomComponents) {
    registerDataBlockComponent(editor);
  }

  return editor;
}

/**
 * Registers the DataBlock custom component type for metadata testing
 */
function registerDataBlockComponent(editor: GrapesJSEditor): void {
  editor.DomComponents.addType('data-block', {
    isComponent: (el: Element) => {
      return el.getAttribute?.('data-gjs-type') === 'data-block';
    },
    model: {
      defaults: {
        tagName: 'div',
        droppable: true,
        attributes: {
          'data-gjs-type': 'data-block',
        },
        traits: [
          {
            type: 'text',
            name: 'dataPath',
            label: 'Data Path',
            default: '',
          },
          {
            type: 'number',
            name: 'limit',
            label: 'Limit',
            default: 10,
          },
          {
            type: 'select',
            name: 'display',
            label: 'Display',
            options: [
              { id: 'table', name: 'Table' },
              { id: 'grid', name: 'Grid' },
            ],
            default: 'table',
          },
          {
            type: 'text',
            name: 'columns',
            label: 'Columns (JSON)',
            default: '[]',
          },
        ],
      },
    },
    view: {
      onRender(): void {
        // Custom render logic if needed
      },
    },
  });
}

/**
 * Loads a GrapesJS project from JSON
 */
export async function loadProject(
  projectData: GrapesJSProject,
  options?: { registerCustomComponents?: boolean }
): Promise<GrapesJSEditor> {
  const editor = await createEditor({
    registerCustomComponents: options?.registerCustomComponents ?? true,
  });

  if (projectData.pages && projectData.pages.length > 0) {
    // Multi-page format
    editor.loadProjectData(projectData);
  } else if (projectData.components) {
    // Legacy single-page format
    editor.setComponents(projectData.components);
    if (projectData.styles) {
      editor.setStyle(projectData.styles);
    }
  }

  return editor;
}

/**
 * Exports HTML and CSS from a GrapesJS editor
 */
export function exportProject(
  editor: GrapesJSEditor,
  options: ExportOptions = { reimportable: false }
): ExportResult {
  let html: string;
  let css: string;

  if (options.reimportable) {
    // Export with data-gjs-* markers for re-import
    html = exportReimportableHtml(editor);
    css = editor.getCss({ avoidProtected: true }) || '';
  } else {
    // Plain export (no markers)
    html = editor.getHtml({ cleanId: true }) || '';
    css = editor.getCss({ avoidProtected: true }) || '';
  }

  if (options.includeWrapper) {
    html = wrapHtml(html, css);
  }

  return { html, css };
}

/**
 * Exports HTML with GrapesJS markers for re-import
 */
function exportReimportableHtml(editor: GrapesJSEditor): string {
  // Get components with all their data
  const wrapper = editor.DomComponents.getWrapper();

  function serializeComponent(comp: unknown): string {
    if (!comp || typeof comp !== 'object') return '';

    const c = comp as {
      get: (key: string) => unknown;
      components: () => unknown[];
      getEl: () => Element | null;
    };

    const tagName = (c.get('tagName') as string) || 'div';
    const type = c.get('type') as string;
    const attributes = (c.get('attributes') as Record<string, string>) || {};
    const content = c.get('content') as string;
    const traits = c.get('traits');

    // Build attribute string
    const attrs: string[] = [];

    // Add component ID for tracking
    const compId = c.get('id') || c.get('cid');
    if (compId) {
      attrs.push(`data-gjs-id="${compId}"`);
    }

    // Add component type marker
    if (type && type !== 'default') {
      attrs.push(`data-gjs-type="${type}"`);
    }

    // Add custom attributes
    for (const [key, value] of Object.entries(attributes)) {
      if (key !== 'id' && key !== 'class') {
        attrs.push(`${key}="${escapeHtml(String(value))}"`);
      } else {
        attrs.push(`${key}="${escapeHtml(String(value))}"`);
      }
    }

    // Add traits as data attributes
    if (traits && typeof traits === 'object') {
      const traitsArray = Array.isArray(traits) ? traits : [];
      for (const trait of traitsArray) {
        const t = trait as { get: (key: string) => unknown };
        const name = t.get?.('name') as string;
        const value = t.get?.('value');
        if (name && value !== undefined && value !== null) {
          attrs.push(`data-gjs-trait-${name}="${escapeHtml(String(value))}"`);
        }
      }
    }

    // Get children
    const children = c.components?.() || [];
    let childrenHtml = '';
    for (const child of children) {
      childrenHtml += serializeComponent(child);
    }

    // Handle void elements
    const voidElements = ['img', 'br', 'hr', 'input', 'meta', 'link'];
    if (voidElements.includes(tagName.toLowerCase())) {
      return `<${tagName} ${attrs.join(' ')} />`;
    }

    return `<${tagName} ${attrs.join(' ')}>${content || ''}${childrenHtml}</${tagName}>`;
  }

  // Get wrapper content
  const wrapperComp = wrapper as {
    components: () => unknown[];
  };
  const components = wrapperComp.components?.() || [];
  let html = '';
  for (const comp of components) {
    html += serializeComponent(comp);
  }

  return html;
}

/**
 * Wraps HTML with full document structure
 */
function wrapHtml(bodyHtml: string, css: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
${css}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/**
 * Imports HTML/CSS back into a GrapesJS editor
 */
export async function importHtml(
  html: string,
  css: string,
  options?: { registerCustomComponents?: boolean }
): Promise<{ editor: GrapesJSEditor; result: ImportResult }> {
  const editor = await createEditor({
    registerCustomComponents: options?.registerCustomComponents ?? true,
  });

  const result: ImportResult = {
    success: false,
    warnings: [],
  };

  try {
    // Parse HTML
    const dom = new JSDOM(html);
    const body = dom.window.document.body;

    if (!body || !body.innerHTML.trim()) {
      result.error = 'Empty or invalid HTML content';
      return { editor, result };
    }

    // Import components
    editor.setComponents(body.innerHTML);

    // Import CSS
    if (css) {
      editor.setStyle(css);
    }

    // Count components
    const wrapper = editor.DomComponents.getWrapper() as { components: () => unknown[] };
    result.componentCount = countComponents(wrapper);

    result.success = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return { editor, result };
}

/**
 * Counts total components in the editor
 */
function countComponents(component: unknown): number {
  if (!component || typeof component !== 'object') return 0;

  const c = component as { components: () => unknown[] };
  const children = c.components?.() || [];
  let count = 1;

  for (const child of children) {
    count += countComponents(child);
  }

  return count;
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Destroys the editor and cleans up resources
 */
export function destroyEditor(editor: GrapesJSEditor): void {
  try {
    editor.destroy();
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Resets the DOM environment
 */
export function resetDOM(): void {
  if (domInstance) {
    domInstance.window.close();
    domInstance = null;
  }

  // Clear globals
  delete (global as unknown as Record<string, unknown>).window;
  delete (global as unknown as Record<string, unknown>).document;
  delete (global as unknown as Record<string, unknown>).navigator;
}
