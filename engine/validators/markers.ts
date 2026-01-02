/**
 * Marker Validator
 *
 * Validates that GrapesJS markers (data-gjs-*) are preserved after AI editing.
 */

import type { MarkerPattern, MarkerValidationResult } from '../types.js';

/**
 * Default marker patterns to validate
 */
export const DEFAULT_MARKER_PATTERNS: MarkerPattern[] = [
  {
    pattern: 'data-gjs-id',
    minCount: 1,
    description: 'Component ID markers',
  },
  {
    pattern: 'data-gjs-type',
    minCount: 0,
    description: 'Component type markers',
  },
];

/**
 * Counts occurrences of a pattern in HTML
 */
export function countPatternOccurrences(html: string, pattern: string): number {
  // Escape special regex characters in the pattern
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  const matches = html.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Validates marker preservation between original and edited HTML
 */
export function validateMarkers(
  originalHtml: string,
  editedHtml: string,
  patterns: MarkerPattern[] = DEFAULT_MARKER_PATTERNS
): MarkerValidationResult {
  const results: MarkerValidationResult['markers'] = [];
  let totalExpected = 0;
  let totalFound = 0;
  let allPassed = true;

  for (const pattern of patterns) {
    const originalCount = countPatternOccurrences(originalHtml, pattern.pattern);
    const editedCount = countPatternOccurrences(editedHtml, pattern.pattern);

    // Expected count is at least minCount or original count (whichever is higher)
    const expected = Math.max(pattern.minCount, originalCount);
    const passed = editedCount >= expected;

    totalExpected += expected;
    totalFound += editedCount;

    if (!passed) {
      allPassed = false;
    }

    results.push({
      pattern: pattern.pattern,
      expected,
      found: editedCount,
      passed,
    });
  }

  return {
    passed: allPassed,
    markers: results,
    totalExpected,
    totalFound,
  };
}

/**
 * Extracts all data-gjs-* attributes from HTML
 */
export function extractMarkers(html: string): Map<string, Set<string>> {
  const markers = new Map<string, Set<string>>();

  // Match data-gjs-* attributes with their values
  const attrRegex = /data-gjs-([a-z0-9-]+)="([^"]*)"/gi;
  let match;

  while ((match = attrRegex.exec(html)) !== null) {
    const name = `data-gjs-${match[1]}`;
    const value = match[2];

    if (!markers.has(name)) {
      markers.set(name, new Set());
    }
    markers.get(name)!.add(value);
  }

  return markers;
}

/**
 * Compares markers between original and edited HTML
 */
export function compareMarkers(
  originalHtml: string,
  editedHtml: string
): {
  preserved: Map<string, Set<string>>;
  lost: Map<string, Set<string>>;
  added: Map<string, Set<string>>;
} {
  const originalMarkers = extractMarkers(originalHtml);
  const editedMarkers = extractMarkers(editedHtml);

  const preserved = new Map<string, Set<string>>();
  const lost = new Map<string, Set<string>>();
  const added = new Map<string, Set<string>>();

  // Find preserved and lost markers
  for (const [name, originalValues] of originalMarkers) {
    const editedValues = editedMarkers.get(name) || new Set();

    const preservedValues = new Set<string>();
    const lostValues = new Set<string>();

    for (const value of originalValues) {
      if (editedValues.has(value)) {
        preservedValues.add(value);
      } else {
        lostValues.add(value);
      }
    }

    if (preservedValues.size > 0) {
      preserved.set(name, preservedValues);
    }
    if (lostValues.size > 0) {
      lost.set(name, lostValues);
    }
  }

  // Find added markers
  for (const [name, editedValues] of editedMarkers) {
    const originalValues = originalMarkers.get(name) || new Set();

    const addedValues = new Set<string>();
    for (const value of editedValues) {
      if (!originalValues.has(value)) {
        addedValues.add(value);
      }
    }

    if (addedValues.size > 0) {
      added.set(name, addedValues);
    }
  }

  return { preserved, lost, added };
}

/**
 * Gets a summary of marker preservation
 */
export function getMarkerSummary(
  originalHtml: string,
  editedHtml: string
): {
  totalOriginal: number;
  totalEdited: number;
  preservationRate: number;
  summary: string;
} {
  const original = extractMarkers(originalHtml);
  const edited = extractMarkers(editedHtml);

  let totalOriginal = 0;
  let totalEdited = 0;

  for (const values of original.values()) {
    totalOriginal += values.size;
  }

  for (const values of edited.values()) {
    totalEdited += values.size;
  }

  const preservationRate = totalOriginal === 0 ? 1 : Math.min(1, totalEdited / totalOriginal);

  const summary = `Markers: ${totalEdited}/${totalOriginal} (${(preservationRate * 100).toFixed(1)}% preserved)`;

  return {
    totalOriginal,
    totalEdited,
    preservationRate,
    summary,
  };
}
