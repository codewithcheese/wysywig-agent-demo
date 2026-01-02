/**
 * Fixture and Suite Loader
 *
 * Loads fixtures and prompt suites from the file system.
 */

import { readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { FixtureSchema, SuiteSchema, type Fixture, type Suite } from '../../engine/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');
const SUITES_DIR = join(__dirname, '..', 'suites');

export interface LoadedFixture {
  id: string;
  fixture: Fixture;
  html: string;
  css: string;
  projectJson?: unknown;
}

export interface LoadedSuite {
  id: string;
  suite: Suite;
}

/**
 * Loads a single fixture by ID
 */
export async function loadFixture(fixtureId: string): Promise<LoadedFixture> {
  const fixtureDir = join(FIXTURES_DIR, fixtureId);

  // Load fixture.json
  const fixtureJsonPath = join(fixtureDir, 'fixture.json');
  const fixtureJsonContent = await readFile(fixtureJsonPath, 'utf-8');
  const fixtureJson = JSON.parse(fixtureJsonContent);
  const fixture = FixtureSchema.parse(fixtureJson);

  // Load reimportable.html
  const htmlPath = join(fixtureDir, 'reimportable.html');
  const html = await readFile(htmlPath, 'utf-8');

  // Load reimportable.css
  const cssPath = join(fixtureDir, 'reimportable.css');
  const css = await readFile(cssPath, 'utf-8');

  // Optionally load project.json
  let projectJson: unknown = undefined;
  try {
    const projectPath = join(fixtureDir, 'project.json');
    const projectContent = await readFile(projectPath, 'utf-8');
    projectJson = JSON.parse(projectContent);
  } catch {
    // project.json is optional
  }

  return {
    id: fixtureId,
    fixture,
    html,
    css,
    projectJson,
  };
}

/**
 * Loads all available fixtures
 */
export async function loadAllFixtures(): Promise<LoadedFixture[]> {
  const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
  const fixtureDirs = entries.filter((e) => e.isDirectory());

  const fixtures: LoadedFixture[] = [];
  for (const dir of fixtureDirs) {
    try {
      const fixture = await loadFixture(dir.name);
      fixtures.push(fixture);
    } catch (error) {
      console.warn(`Failed to load fixture ${dir.name}:`, error);
    }
  }

  return fixtures;
}

/**
 * Loads fixtures by IDs
 */
export async function loadFixtures(fixtureIds: string[]): Promise<LoadedFixture[]> {
  const fixtures: LoadedFixture[] = [];
  for (const id of fixtureIds) {
    try {
      const fixture = await loadFixture(id);
      fixtures.push(fixture);
    } catch (error) {
      console.warn(`Failed to load fixture ${id}:`, error);
    }
  }
  return fixtures;
}

/**
 * Loads a single suite by ID
 */
export async function loadSuite(suiteId: string): Promise<LoadedSuite> {
  const suitePath = join(SUITES_DIR, `${suiteId}.json`);
  const suiteContent = await readFile(suitePath, 'utf-8');
  const suiteJson = JSON.parse(suiteContent);
  const suite = SuiteSchema.parse(suiteJson);

  return {
    id: suiteId,
    suite,
  };
}

/**
 * Loads all available suites
 */
export async function loadAllSuites(): Promise<LoadedSuite[]> {
  const entries = await readdir(SUITES_DIR);
  const suiteFiles = entries.filter((e) => e.endsWith('.json'));

  const suites: LoadedSuite[] = [];
  for (const file of suiteFiles) {
    const suiteId = file.replace('.json', '');
    try {
      const suite = await loadSuite(suiteId);
      suites.push(suite);
    } catch (error) {
      console.warn(`Failed to load suite ${suiteId}:`, error);
    }
  }

  return suites;
}

/**
 * Loads suites by IDs
 */
export async function loadSuites(suiteIds: string[]): Promise<LoadedSuite[]> {
  const suites: LoadedSuite[] = [];
  for (const id of suiteIds) {
    try {
      const suite = await loadSuite(id);
      suites.push(suite);
    } catch (error) {
      console.warn(`Failed to load suite ${id}:`, error);
    }
  }
  return suites;
}

/**
 * Gets list of available fixture IDs
 */
export async function getAvailableFixtures(): Promise<string[]> {
  const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * Gets list of available suite IDs
 */
export async function getAvailableSuites(): Promise<string[]> {
  const entries = await readdir(SUITES_DIR);
  return entries.filter((e) => e.endsWith('.json')).map((e) => e.replace('.json', ''));
}
