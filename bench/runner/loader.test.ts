import { describe, it, expect } from 'vitest';
import {
  loadFixture,
  loadSuite,
  loadAllFixtures,
  loadAllSuites,
  getAvailableFixtures,
  getAvailableSuites,
} from './loader.js';

describe('loadFixture', () => {
  it('loads simple-one-page fixture', async () => {
    const fixture = await loadFixture('simple-one-page');

    expect(fixture.id).toBe('simple-one-page');
    expect(fixture.fixture.name).toBe('simple-one-page');
    expect(fixture.html).toContain('data-gjs-id');
    expect(fixture.css).toContain('#section-hero');
  });

  it('loads metadata-stress fixture with DataBlock markers', async () => {
    const fixture = await loadFixture('metadata-stress');

    expect(fixture.html).toContain('data-gjs-type="data-block"');
    expect(fixture.html).toContain('data-gjs-trait-dataPath');
    expect(fixture.fixture.expectedMarkers.length).toBeGreaterThan(0);
    expect(fixture.fixture.expectedMetadata.length).toBeGreaterThan(0);
  });

  it('throws for non-existent fixture', async () => {
    await expect(loadFixture('non-existent')).rejects.toThrow();
  });
});

describe('loadSuite', () => {
  it('loads cosmetic suite', async () => {
    const suite = await loadSuite('cosmetic');

    expect(suite.id).toBe('cosmetic');
    expect(suite.suite.name).toBe('cosmetic');
    expect(suite.suite.prompts.length).toBeGreaterThan(0);
  });

  it('loads prompts with required fields', async () => {
    const suite = await loadSuite('layout');

    for (const prompt of suite.suite.prompts) {
      expect(prompt.id).toBeDefined();
      expect(prompt.category).toBeDefined();
      expect(prompt.prompt).toBeDefined();
    }
  });

  it('throws for non-existent suite', async () => {
    await expect(loadSuite('non-existent')).rejects.toThrow();
  });
});

describe('loadAllFixtures', () => {
  it('loads all available fixtures', async () => {
    const fixtures = await loadAllFixtures();

    expect(fixtures.length).toBeGreaterThanOrEqual(5);

    const ids = fixtures.map(f => f.id);
    expect(ids).toContain('simple-one-page');
    expect(ids).toContain('two-column-hero');
    expect(ids).toContain('table-heavy');
    expect(ids).toContain('metadata-stress');
    expect(ids).toContain('print-focused');
  });
});

describe('loadAllSuites', () => {
  it('loads all available suites', async () => {
    const suites = await loadAllSuites();

    expect(suites.length).toBeGreaterThanOrEqual(4);

    const ids = suites.map(s => s.id);
    expect(ids).toContain('cosmetic');
    expect(ids).toContain('layout');
    expect(ids).toContain('print');
    expect(ids).toContain('metadata');
  });
});

describe('getAvailableFixtures', () => {
  it('returns fixture IDs', async () => {
    const fixtures = await getAvailableFixtures();

    expect(fixtures).toContain('simple-one-page');
    expect(fixtures).toContain('metadata-stress');
  });
});

describe('getAvailableSuites', () => {
  it('returns suite IDs', async () => {
    const suites = await getAvailableSuites();

    expect(suites).toContain('cosmetic');
    expect(suites).toContain('layout');
  });
});
