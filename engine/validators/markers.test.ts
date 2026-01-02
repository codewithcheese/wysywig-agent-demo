import { describe, it, expect } from 'vitest';
import {
  validateMarkers,
  countPatternOccurrences,
  extractMarkers,
  compareMarkers,
  getMarkerSummary,
} from './markers.js';

describe('countPatternOccurrences', () => {
  it('counts single occurrence', () => {
    const html = '<div data-gjs-id="abc">Content</div>';
    expect(countPatternOccurrences(html, 'data-gjs-id')).toBe(1);
  });

  it('counts multiple occurrences', () => {
    const html = `
      <div data-gjs-id="a">
        <span data-gjs-id="b">Text</span>
        <p data-gjs-id="c">Para</p>
      </div>
    `;
    expect(countPatternOccurrences(html, 'data-gjs-id')).toBe(3);
  });

  it('returns 0 for no matches', () => {
    const html = '<div>No markers</div>';
    expect(countPatternOccurrences(html, 'data-gjs-id')).toBe(0);
  });

  it('is case insensitive', () => {
    const html = '<div DATA-GJS-ID="abc">Content</div>';
    expect(countPatternOccurrences(html, 'data-gjs-id')).toBe(1);
  });
});

describe('extractMarkers', () => {
  it('extracts marker names and values', () => {
    const html = '<div data-gjs-id="abc" data-gjs-type="text">Content</div>';
    const markers = extractMarkers(html);

    expect(markers.has('data-gjs-id')).toBe(true);
    expect(markers.get('data-gjs-id')?.has('abc')).toBe(true);
    expect(markers.has('data-gjs-type')).toBe(true);
    expect(markers.get('data-gjs-type')?.has('text')).toBe(true);
  });

  it('handles multiple values for same marker type', () => {
    const html = `
      <div data-gjs-id="a">
        <span data-gjs-id="b">Text</span>
      </div>
    `;
    const markers = extractMarkers(html);
    const ids = markers.get('data-gjs-id');

    expect(ids?.size).toBe(2);
    expect(ids?.has('a')).toBe(true);
    expect(ids?.has('b')).toBe(true);
  });

  it('returns empty map for no markers', () => {
    const html = '<div>No markers</div>';
    const markers = extractMarkers(html);
    expect(markers.size).toBe(0);
  });
});

describe('compareMarkers', () => {
  it('identifies preserved markers', () => {
    const original = '<div data-gjs-id="abc">Original</div>';
    const edited = '<div data-gjs-id="abc" class="new">Edited</div>';

    const result = compareMarkers(original, edited);

    expect(result.preserved.get('data-gjs-id')?.has('abc')).toBe(true);
    expect(result.lost.size).toBe(0);
  });

  it('identifies lost markers', () => {
    const original = '<div data-gjs-id="abc">Original</div>';
    const edited = '<div class="new">Edited</div>';

    const result = compareMarkers(original, edited);

    expect(result.lost.get('data-gjs-id')?.has('abc')).toBe(true);
  });

  it('identifies added markers', () => {
    const original = '<div>Original</div>';
    const edited = '<div data-gjs-id="new">Edited</div>';

    const result = compareMarkers(original, edited);

    expect(result.added.get('data-gjs-id')?.has('new')).toBe(true);
  });
});

describe('validateMarkers', () => {
  it('passes when all markers preserved', () => {
    const original = `
      <div data-gjs-id="a">
        <span data-gjs-id="b">Text</span>
      </div>
    `;
    const edited = `
      <div data-gjs-id="a" class="styled">
        <span data-gjs-id="b" style="color:red">Text</span>
      </div>
    `;

    const result = validateMarkers(original, edited);
    expect(result.passed).toBe(true);
  });

  it('fails when markers are lost', () => {
    const original = `
      <div data-gjs-id="a">
        <span data-gjs-id="b">Text</span>
      </div>
    `;
    const edited = `
      <div data-gjs-id="a" class="styled">
        <span>Text</span>
      </div>
    `;

    const result = validateMarkers(original, edited, [
      { pattern: 'data-gjs-id', minCount: 2 }
    ]);
    expect(result.passed).toBe(false);
  });

  it('reports marker counts correctly', () => {
    const original = '<div data-gjs-id="a" data-gjs-id="b" data-gjs-id="c">Content</div>';
    const edited = '<div data-gjs-id="a">Content</div>';

    const result = validateMarkers(original, edited, [
      { pattern: 'data-gjs-id', minCount: 1 }
    ]);

    expect(result.totalExpected).toBe(3);
    expect(result.totalFound).toBe(1);
  });
});

describe('getMarkerSummary', () => {
  it('calculates preservation rate', () => {
    const original = `
      <div data-gjs-id="a">
        <span data-gjs-id="b">Text</span>
      </div>
    `;
    const edited = '<div data-gjs-id="a">Text</div>';

    const summary = getMarkerSummary(original, edited);

    expect(summary.totalOriginal).toBe(2);
    expect(summary.totalEdited).toBe(1);
    expect(summary.preservationRate).toBe(0.5);
  });

  it('handles 100% preservation', () => {
    const html = '<div data-gjs-id="a"><span data-gjs-id="b">Text</span></div>';

    const summary = getMarkerSummary(html, html);

    expect(summary.preservationRate).toBe(1);
    expect(summary.summary).toContain('100.0%');
  });

  it('handles no markers', () => {
    const html = '<div>No markers</div>';

    const summary = getMarkerSummary(html, html);

    expect(summary.totalOriginal).toBe(0);
    expect(summary.preservationRate).toBe(1);
  });
});
