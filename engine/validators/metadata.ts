/**
 * Metadata Validator
 *
 * Validates that component metadata (traits, props) are preserved
 * after AI editing and re-import into GrapesJS.
 */

import { JSDOM } from 'jsdom';
import type { MetadataInvariant, MetadataValidationResult, DataBlockProps } from '../types.js';
import { createHash } from 'crypto';

/**
 * Extracts component metadata from HTML
 */
export function extractComponentMetadata(html: string): ComponentMetadata[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const components: ComponentMetadata[] = [];

  // Find all elements with data-gjs-type
  const typedElements = doc.querySelectorAll('[data-gjs-type]');

  for (const el of typedElements) {
    const type = el.getAttribute('data-gjs-type');
    const id = el.getAttribute('data-gjs-id') || el.id || null;

    // Extract trait values from data-gjs-trait-* attributes
    const traits: Record<string, string> = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-gjs-trait-')) {
        const traitName = attr.name.substring('data-gjs-trait-'.length);
        traits[traitName] = attr.value;
      }
    }

    // Also extract any other data-gjs-* attributes as metadata
    const metadata: Record<string, string> = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-gjs-') && !attr.name.startsWith('data-gjs-trait-')) {
        metadata[attr.name] = attr.value;
      }
    }

    components.push({
      type: type!,
      id,
      traits,
      metadata,
      element: {
        tagName: el.tagName.toLowerCase(),
        innerHTML: el.innerHTML,
      },
    });
  }

  return components;
}

export interface ComponentMetadata {
  type: string;
  id: string | null;
  traits: Record<string, string>;
  metadata: Record<string, string>;
  element: {
    tagName: string;
    innerHTML: string;
  };
}

/**
 * Validates metadata preservation based on invariants
 */
export function validateMetadata(
  editedHtml: string,
  invariants: MetadataInvariant[]
): MetadataValidationResult {
  const components = extractComponentMetadata(editedHtml);
  const result: MetadataValidationResult = {
    passed: true,
    components: [],
  };

  // Group invariants by component type
  const invariantsByType = new Map<string, MetadataInvariant[]>();
  for (const inv of invariants) {
    const existing = invariantsByType.get(inv.componentType) || [];
    existing.push(inv);
    invariantsByType.set(inv.componentType, existing);
  }

  // Check each component type
  for (const [type, typeInvariants] of invariantsByType) {
    const matchingComponents = components.filter((c) => c.type === type);
    const found = matchingComponents.length > 0;

    const componentResult = {
      type,
      found,
      traits: [] as {
        name: string;
        expected: unknown;
        actual: unknown;
        matched: boolean;
      }[],
    };

    // Check if component must exist
    const mustExist = typeInvariants.some((inv) => inv.mustExist);
    if (mustExist && !found) {
      result.passed = false;
    }

    // Check trait values
    for (const inv of typeInvariants) {
      for (const comp of matchingComponents) {
        const actual = comp.traits[inv.traitName];

        let matched = true;
        if (inv.expectedValue !== undefined) {
          matched = actual === String(inv.expectedValue);
        } else if (inv.mustExist) {
          matched = actual !== undefined;
        }

        if (!matched) {
          result.passed = false;
        }

        componentResult.traits.push({
          name: inv.traitName,
          expected: inv.expectedValue,
          actual,
          matched,
        });
      }
    }

    result.components.push(componentResult);
  }

  return result;
}

/**
 * Extracts DataBlock-specific props from HTML
 */
export function extractDataBlockProps(html: string): DataBlockProps[] {
  const components = extractComponentMetadata(html);
  const dataBlocks: DataBlockProps[] = [];

  for (const comp of components) {
    if (comp.type === 'data-block') {
      const props: DataBlockProps = {
        dataPath: comp.traits['dataPath'] || '',
        limit: parseInt(comp.traits['limit'] || '10', 10),
        display: (comp.traits['display'] as 'table' | 'grid') || 'table',
        columns: [],
      };

      // Parse columns JSON if present
      if (comp.traits['columns']) {
        try {
          props.columns = JSON.parse(comp.traits['columns']);
        } catch {
          props.columns = [];
        }
      }

      dataBlocks.push(props);
    }
  }

  return dataBlocks;
}

/**
 * Compares DataBlock props between original and edited HTML
 */
export function compareDataBlockProps(
  originalHtml: string,
  editedHtml: string
): {
  preserved: boolean;
  original: DataBlockProps[];
  edited: DataBlockProps[];
  differences: PropDifference[];
} {
  const original = extractDataBlockProps(originalHtml);
  const edited = extractDataBlockProps(editedHtml);

  const differences: PropDifference[] = [];

  // Check count
  if (original.length !== edited.length) {
    differences.push({
      type: 'count',
      original: original.length,
      edited: edited.length,
    });
  }

  // Compare props (order-dependent for now)
  const compareCount = Math.min(original.length, edited.length);
  for (let i = 0; i < compareCount; i++) {
    const orig = original[i];
    const edit = edited[i];

    if (orig.dataPath !== edit.dataPath) {
      differences.push({
        type: 'dataPath',
        index: i,
        original: orig.dataPath,
        edited: edit.dataPath,
      });
    }

    if (orig.limit !== edit.limit) {
      differences.push({
        type: 'limit',
        index: i,
        original: orig.limit,
        edited: edit.limit,
      });
    }

    if (orig.display !== edit.display) {
      differences.push({
        type: 'display',
        index: i,
        original: orig.display,
        edited: edit.display,
      });
    }

    // Compare columns
    const origColumnsJson = JSON.stringify(orig.columns);
    const editColumnsJson = JSON.stringify(edit.columns);
    if (origColumnsJson !== editColumnsJson) {
      differences.push({
        type: 'columns',
        index: i,
        original: orig.columns,
        edited: edit.columns,
      });
    }
  }

  return {
    preserved: differences.length === 0,
    original,
    edited,
    differences,
  };
}

export interface PropDifference {
  type: string;
  index?: number;
  original: unknown;
  edited: unknown;
}

/**
 * Generates a hash of all metadata for drift detection
 */
export function hashMetadata(html: string): string {
  const components = extractComponentMetadata(html);

  // Create a deterministic representation
  const normalized = components.map((c) => ({
    type: c.type,
    traits: Object.entries(c.traits).sort((a, b) => a[0].localeCompare(b[0])),
    metadata: Object.entries(c.metadata).sort((a, b) => a[0].localeCompare(b[0])),
  }));

  const json = JSON.stringify(normalized, null, 0);
  return createHash('sha256').update(json).digest('hex').substring(0, 16);
}

/**
 * Gets a component count from HTML
 */
export function countComponents(html: string): number {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Count all elements with data-gjs-id
  const elements = doc.querySelectorAll('[data-gjs-id]');
  return elements.length;
}
