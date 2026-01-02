import { describe, it, expect } from 'vitest';
import {
  extractComponentMetadata,
  validateMetadata,
  extractDataBlockProps,
  compareDataBlockProps,
  hashMetadata,
  countComponents,
} from './metadata.js';

describe('extractComponentMetadata', () => {
  it('extracts component type and id', () => {
    const html = '<div data-gjs-type="text" data-gjs-id="abc">Content</div>';
    const components = extractComponentMetadata(html);

    expect(components).toHaveLength(1);
    expect(components[0].type).toBe('text');
    expect(components[0].id).toBe('abc');
  });

  it('extracts trait values', () => {
    // Note: HTML attributes are lowercased by the parser
    const html = `
      <div data-gjs-type="data-block"
           data-gjs-trait-datapath="api/users"
           data-gjs-trait-limit="10">
        Content
      </div>
    `;
    const components = extractComponentMetadata(html);

    expect(components[0].traits['datapath']).toBe('api/users');
    expect(components[0].traits['limit']).toBe('10');
  });

  it('handles multiple components', () => {
    const html = `
      <div data-gjs-type="section" data-gjs-id="s1">
        <p data-gjs-type="text" data-gjs-id="t1">Text</p>
        <p data-gjs-type="text" data-gjs-id="t2">More</p>
      </div>
    `;
    const components = extractComponentMetadata(html);

    expect(components).toHaveLength(3);
  });

  it('captures element info', () => {
    const html = '<section data-gjs-type="container">Inner</section>';
    const components = extractComponentMetadata(html);

    expect(components[0].element.tagName).toBe('section');
    expect(components[0].element.innerHTML).toBe('Inner');
  });
});

describe('validateMetadata', () => {
  it('passes when required components exist', () => {
    // Note: traitName must be lowercase to match parsed HTML attributes
    const html = '<div data-gjs-type="data-block" data-gjs-trait-datapath="api/test">Content</div>';

    const result = validateMetadata(html, [
      { componentType: 'data-block', traitName: 'datapath', mustExist: true }
    ]);

    expect(result.passed).toBe(true);
  });

  it('fails when required component missing', () => {
    const html = '<div data-gjs-type="text">Content</div>';

    const result = validateMetadata(html, [
      { componentType: 'data-block', traitName: 'dataPath', mustExist: true }
    ]);

    expect(result.passed).toBe(false);
  });

  it('validates expected trait values', () => {
    const html = '<div data-gjs-type="widget" data-gjs-trait-mode="dark">Content</div>';

    const passResult = validateMetadata(html, [
      { componentType: 'widget', traitName: 'mode', expectedValue: 'dark', mustExist: true }
    ]);
    expect(passResult.passed).toBe(true);

    const failResult = validateMetadata(html, [
      { componentType: 'widget', traitName: 'mode', expectedValue: 'light', mustExist: true }
    ]);
    expect(failResult.passed).toBe(false);
  });
});

describe('extractDataBlockProps', () => {
  it('extracts DataBlock properties', () => {
    // Note: HTML attributes are lowercased by the parser
    const html = `
      <div data-gjs-type="data-block"
           data-gjs-trait-datapath="api/users"
           data-gjs-trait-limit="10"
           data-gjs-trait-display="table"
           data-gjs-trait-columns='[{"key":"name","label":"Name"}]'>
        Content
      </div>
    `;
    const props = extractDataBlockProps(html);

    expect(props).toHaveLength(1);
    expect(props[0].dataPath).toBe('api/users');
    expect(props[0].limit).toBe(10);
    expect(props[0].display).toBe('table');
    expect(props[0].columns).toHaveLength(1);
    expect(props[0].columns[0].key).toBe('name');
  });

  it('handles multiple DataBlocks', () => {
    const html = `
      <div data-gjs-type="data-block" data-gjs-trait-datapath="api/a"></div>
      <div data-gjs-type="data-block" data-gjs-trait-datapath="api/b"></div>
    `;
    const props = extractDataBlockProps(html);

    expect(props).toHaveLength(2);
  });

  it('uses defaults for missing traits', () => {
    const html = '<div data-gjs-type="data-block">Content</div>';
    const props = extractDataBlockProps(html);

    expect(props[0].dataPath).toBe('');
    expect(props[0].limit).toBe(10);
    expect(props[0].display).toBe('table');
    expect(props[0].columns).toEqual([]);
  });
});

describe('compareDataBlockProps', () => {
  it('detects preserved props', () => {
    const html = `
      <div data-gjs-type="data-block"
           data-gjs-trait-datapath="api/users"
           data-gjs-trait-limit="10">
        Content
      </div>
    `;

    const result = compareDataBlockProps(html, html);

    expect(result.preserved).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it('detects changed dataPath', () => {
    const original = '<div data-gjs-type="data-block" data-gjs-trait-datapath="api/a"></div>';
    const edited = '<div data-gjs-type="data-block" data-gjs-trait-datapath="api/b"></div>';

    const result = compareDataBlockProps(original, edited);

    expect(result.preserved).toBe(false);
    expect(result.differences).toContainEqual({
      type: 'dataPath',
      index: 0,
      original: 'api/a',
      edited: 'api/b',
    });
  });

  it('detects count changes', () => {
    const original = `
      <div data-gjs-type="data-block"></div>
      <div data-gjs-type="data-block"></div>
    `;
    const edited = '<div data-gjs-type="data-block"></div>';

    const result = compareDataBlockProps(original, edited);

    expect(result.preserved).toBe(false);
    expect(result.differences).toContainEqual({
      type: 'count',
      original: 2,
      edited: 1,
    });
  });
});

describe('hashMetadata', () => {
  it('produces consistent hashes', () => {
    const html = '<div data-gjs-type="text" data-gjs-id="abc">Content</div>';

    const hash1 = hashMetadata(html);
    const hash2 = hashMetadata(html);

    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different content', () => {
    const html1 = '<div data-gjs-type="text" data-gjs-trait-color="red">A</div>';
    const html2 = '<div data-gjs-type="text" data-gjs-trait-color="blue">A</div>';

    const hash1 = hashMetadata(html1);
    const hash2 = hashMetadata(html2);

    expect(hash1).not.toBe(hash2);
  });

  it('returns same hash when non-metadata changes', () => {
    const html1 = '<div data-gjs-type="text">Short</div>';
    const html2 = '<div data-gjs-type="text">Longer content here</div>';

    const hash1 = hashMetadata(html1);
    const hash2 = hashMetadata(html2);

    expect(hash1).toBe(hash2);
  });
});

describe('countComponents', () => {
  it('counts elements with data-gjs-id', () => {
    const html = `
      <div data-gjs-id="a">
        <span data-gjs-id="b">Text</span>
        <p data-gjs-id="c">Para</p>
      </div>
    `;

    expect(countComponents(html)).toBe(3);
  });

  it('returns 0 for no components', () => {
    const html = '<div>No markers</div>';
    expect(countComponents(html)).toBe(0);
  });
});
