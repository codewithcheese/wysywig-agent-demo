/**
 * Test Case Executor
 *
 * Executes a single test case: export → LLM edit → sanitize → import → validate
 */

import type {
  LLMProvider,
  TestCaseResult,
  PromptCase,
  ValidationResult,
} from '../../engine/types.js';
import { importHtml, exportProject, destroyEditor } from '../../engine/grapesjs/index.js';
import { sanitize } from '../../engine/sanitize/index.js';
import { validateMarkers, getMarkerSummary } from '../../engine/validators/markers.js';
import { validateMetadata, hashMetadata, countComponents } from '../../engine/validators/metadata.js';
import { SYSTEM_PROMPT, createRepairPrompt, parseResponse } from '../../providers/common/templates.js';
import type { LoadedFixture } from './loader.js';

export interface ExecuteOptions {
  provider: LLMProvider;
  fixture: LoadedFixture;
  prompt: PromptCase;
  allowRepair: boolean;
  verbose?: boolean;
}

/**
 * Executes a single test case
 */
export async function executeTestCase(options: ExecuteOptions): Promise<TestCaseResult> {
  const { provider, fixture, prompt, allowRepair, verbose } = options;

  const startTime = Date.now();
  const timings = {
    llm: 0,
    sanitize: 0,
    import: 0,
    export: 0,
    validate: 0,
    total: 0,
  };
  const errors: TestCaseResult['errors'] = [];

  // Initialize result
  const result: TestCaseResult = {
    config: {
      fixtureId: fixture.id,
      promptId: prompt.id,
      provider: provider.name,
      model: '',
      strategy: {
        exportFormat: 'reimportable',
        allowRepair,
        promptTemplate: 'default',
      },
    },
    timestamp: new Date().toISOString(),
    attempts: 0,
    importSuccess: false,
    repairUsed: false,
    repairSuccess: false,
    markerPreserved: false,
    markerCounts: {
      before: 0,
      after: 0,
    },
    metadataPreserved: false,
    metadataDetails: {
      passed: false,
      components: [],
    },
    diffStats: {
      htmlCharsBefore: fixture.html.length,
      htmlCharsAfter: 0,
      cssCharsBefore: fixture.css.length,
      cssCharsAfter: 0,
      htmlGrowthPercent: 0,
      cssGrowthPercent: 0,
    },
    timingsMs: timings,
    errors,
  };

  // Count markers in original
  const originalMarkerSummary = getMarkerSummary(fixture.html, fixture.html);
  result.markerCounts.before = originalMarkerSummary.totalOriginal;

  try {
    // Step 1: Call LLM to edit
    if (verbose) {
      console.log(`  Calling LLM with prompt: ${prompt.id}`);
    }

    const llmStart = Date.now();
    result.attempts = 1;

    const llmResponse = await provider.call({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: prompt.prompt,
      html: fixture.html,
      css: fixture.css,
    });

    timings.llm = Date.now() - llmStart;

    let editedHtml = llmResponse.html;
    let editedCss = llmResponse.css || fixture.css;

    result.llmResponse = {
      html: editedHtml,
      css: editedCss,
      rawResponse: llmResponse.rawResponse,
    };

    if (!editedHtml) {
      errors.push({
        phase: 'llm',
        message: 'LLM returned empty HTML',
        details: llmResponse.rawResponse.substring(0, 500),
      });
      timings.total = Date.now() - startTime;
      return result;
    }

    // Step 2: Sanitize
    if (verbose) {
      console.log('  Sanitizing output...');
    }

    const sanitizeStart = Date.now();
    const sanitizeResult = sanitize(editedHtml, editedCss);
    timings.sanitize = Date.now() - sanitizeStart;

    if (sanitizeResult.warnings.length > 0 && verbose) {
      console.log('  Sanitization warnings:', sanitizeResult.warnings);
    }

    editedHtml = sanitizeResult.sanitizedHtml;
    editedCss = sanitizeResult.sanitizedCss;

    // Step 3: Import into GrapesJS
    if (verbose) {
      console.log('  Importing into GrapesJS...');
    }

    const importStart = Date.now();
    let importResult = await importHtml(editedHtml, editedCss);
    timings.import = Date.now() - importStart;

    // Step 4: Handle repair if needed
    if (!importResult.result.success && allowRepair) {
      if (verbose) {
        console.log('  Import failed, attempting repair...');
      }

      result.repairUsed = true;
      result.attempts = 2;

      // Destroy failed editor
      destroyEditor(importResult.editor);

      // Call LLM for repair
      const repairStart = Date.now();
      const repairPrompt = createRepairPrompt({
        html: editedHtml,
        css: editedCss,
        error: importResult.result.error || 'Import failed',
        originalInstruction: prompt.prompt,
      });

      const repairResponse = await provider.call({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: repairPrompt,
        html: editedHtml,
        css: editedCss,
      });

      timings.llm += Date.now() - repairStart;

      const repaired = parseResponse(repairResponse.rawResponse);
      editedHtml = repaired.html || editedHtml;
      editedCss = repaired.css || editedCss;

      // Re-sanitize
      const reSanitized = sanitize(editedHtml, editedCss);
      editedHtml = reSanitized.sanitizedHtml;
      editedCss = reSanitized.sanitizedCss;

      // Re-import
      const reImportStart = Date.now();
      importResult = await importHtml(editedHtml, editedCss);
      timings.import += Date.now() - reImportStart;

      result.repairSuccess = importResult.result.success;
    }

    result.importSuccess = importResult.result.success;

    if (!importResult.result.success) {
      errors.push({
        phase: 'import',
        message: importResult.result.error || 'Import failed',
      });
      destroyEditor(importResult.editor);
      timings.total = Date.now() - startTime;
      return result;
    }

    // Step 5: Export from GrapesJS
    if (verbose) {
      console.log('  Exporting from GrapesJS...');
    }

    const exportStart = Date.now();
    const exported = exportProject(importResult.editor, { reimportable: true });
    timings.export = Date.now() - exportStart;

    // Step 6: Validate
    if (verbose) {
      console.log('  Validating results...');
    }

    const validateStart = Date.now();

    // Marker validation
    const markerResult = validateMarkers(
      fixture.html,
      exported.html,
      fixture.fixture.expectedMarkers
    );
    result.markerPreserved = markerResult.passed;
    result.markerCounts.after = markerResult.totalFound;

    // Metadata validation
    const metadataResult = validateMetadata(
      exported.html,
      fixture.fixture.expectedMetadata
    );
    result.metadataPreserved = metadataResult.passed;
    result.metadataDetails = metadataResult;

    timings.validate = Date.now() - validateStart;

    // Calculate diff stats
    result.diffStats.htmlCharsAfter = exported.html.length;
    result.diffStats.cssCharsAfter = exported.css.length;
    result.diffStats.htmlGrowthPercent =
      ((exported.html.length - fixture.html.length) / fixture.html.length) * 100;
    result.diffStats.cssGrowthPercent =
      fixture.css.length > 0
        ? ((exported.css.length - fixture.css.length) / fixture.css.length) * 100
        : 0;

    // Cleanup
    destroyEditor(importResult.editor);
  } catch (error) {
    errors.push({
      phase: 'execution',
      message: error instanceof Error ? error.message : String(error),
      details: error instanceof Error ? error.stack : undefined,
    });
  }

  timings.total = Date.now() - startTime;
  return result;
}
