/**
 * Drift Detection Suite
 *
 * Runs multiple import/export cycles to detect content drift,
 * HTML ballooning, and metadata degradation.
 */

import type { LLMProvider, DriftCycleResult, DriftTestResult } from '../../engine/types.js';
import { importHtml, exportProject, destroyEditor } from '../../engine/grapesjs/index.js';
import { sanitize } from '../../engine/sanitize/index.js';
import { hashMetadata, countComponents } from '../../engine/validators/metadata.js';
import { getMarkerSummary } from '../../engine/validators/markers.js';
import { SYSTEM_PROMPT, createDriftPrompt } from '../../providers/common/templates.js';
import type { LoadedFixture } from './loader.js';

export interface DriftTestOptions {
  provider: LLMProvider;
  fixture: LoadedFixture;
  cycles: number;
  verbose?: boolean;
  maxHtmlGrowthPercent?: number;
  maxCssGrowthPercent?: number;
}

/**
 * Runs a drift test for a single fixture
 */
export async function runDriftTest(options: DriftTestOptions): Promise<DriftTestResult> {
  const {
    provider,
    fixture,
    cycles,
    verbose,
    maxHtmlGrowthPercent = 50,
    maxCssGrowthPercent = 50,
  } = options;

  const results: DriftCycleResult[] = [];
  let currentHtml = fixture.html;
  let currentCss = fixture.css;

  // Initial metrics
  const initialHtmlSize = currentHtml.length;
  const initialCssSize = currentCss.length;
  const initialMarkerCount = getMarkerSummary(currentHtml, currentHtml).totalOriginal;
  const initialMetadataHash = hashMetadata(currentHtml);

  // Record cycle 0 (baseline)
  results.push({
    cycle: 0,
    componentCount: countComponents(currentHtml),
    markerCount: initialMarkerCount,
    htmlSize: initialHtmlSize,
    cssSize: initialCssSize,
    metadataHash: initialMetadataHash,
    importSuccess: true,
  });

  // Run N cycles
  for (let cycle = 1; cycle <= cycles; cycle++) {
    if (verbose) {
      console.log(`  Cycle ${cycle}/${cycles}...`);
    }

    try {
      // Call LLM with no-op prompt
      const driftPrompt = createDriftPrompt({
        html: currentHtml,
        css: currentCss,
      });

      const response = await provider.call({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: driftPrompt,
        html: currentHtml,
        css: currentCss,
      });

      let editedHtml = response.html || currentHtml;
      let editedCss = response.css || currentCss;

      // Sanitize
      const sanitized = sanitize(editedHtml, editedCss);
      editedHtml = sanitized.sanitizedHtml;
      editedCss = sanitized.sanitizedCss;

      // Import
      const importResult = await importHtml(editedHtml, editedCss);

      if (!importResult.result.success) {
        results.push({
          cycle,
          componentCount: 0,
          markerCount: 0,
          htmlSize: editedHtml.length,
          cssSize: editedCss.length,
          metadataHash: '',
          importSuccess: false,
          error: importResult.result.error,
        });

        destroyEditor(importResult.editor);
        break;
      }

      // Export
      const exported = exportProject(importResult.editor, { reimportable: true });
      destroyEditor(importResult.editor);

      // Update current state
      currentHtml = exported.html;
      currentCss = exported.css;

      // Record metrics
      const markerSummary = getMarkerSummary(fixture.html, currentHtml);
      const metadataHash = hashMetadata(currentHtml);

      results.push({
        cycle,
        componentCount: countComponents(currentHtml),
        markerCount: markerSummary.totalEdited,
        htmlSize: currentHtml.length,
        cssSize: currentCss.length,
        metadataHash,
        importSuccess: true,
      });

      if (verbose) {
        console.log(`    HTML: ${currentHtml.length} chars, Markers: ${markerSummary.totalEdited}`);
      }
    } catch (error) {
      results.push({
        cycle,
        componentCount: 0,
        markerCount: 0,
        htmlSize: currentHtml.length,
        cssSize: currentCss.length,
        metadataHash: '',
        importSuccess: false,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  // Calculate drift metrics
  const lastResult = results[results.length - 1];
  const firstResult = results[0];

  const componentCountDrift = lastResult.componentCount - firstResult.componentCount;
  const markerCountDrift = lastResult.markerCount - firstResult.markerCount;
  const htmlSizeGrowthPercent =
    ((lastResult.htmlSize - initialHtmlSize) / initialHtmlSize) * 100;
  const cssSizeGrowthPercent =
    initialCssSize > 0
      ? ((lastResult.cssSize - initialCssSize) / initialCssSize) * 100
      : 0;
  const metadataChanged = lastResult.metadataHash !== initialMetadataHash;

  // Determine pass/fail
  let passed = true;
  let failureReason: string | undefined;

  // Check for import failures
  const importFailure = results.find((r) => !r.importSuccess);
  if (importFailure) {
    passed = false;
    failureReason = `Import failed at cycle ${importFailure.cycle}: ${importFailure.error}`;
  }

  // Check for HTML ballooning
  if (passed && htmlSizeGrowthPercent > maxHtmlGrowthPercent) {
    passed = false;
    failureReason = `HTML size grew ${htmlSizeGrowthPercent.toFixed(1)}% (max: ${maxHtmlGrowthPercent}%)`;
  }

  // Check for CSS ballooning
  if (passed && cssSizeGrowthPercent > maxCssGrowthPercent) {
    passed = false;
    failureReason = `CSS size grew ${cssSizeGrowthPercent.toFixed(1)}% (max: ${maxCssGrowthPercent}%)`;
  }

  // Check for marker loss
  if (passed && lastResult.markerCount < firstResult.markerCount) {
    passed = false;
    failureReason = `Marker count decreased from ${firstResult.markerCount} to ${lastResult.markerCount}`;
  }

  // Check for metadata change
  if (passed && metadataChanged) {
    passed = false;
    failureReason = 'Metadata hash changed during drift test';
  }

  return {
    fixtureId: fixture.id,
    cycles: results,
    passed,
    failureReason,
    metrics: {
      componentCountDrift,
      markerCountDrift,
      htmlSizeGrowthPercent,
      cssSizeGrowthPercent,
      metadataChanged,
    },
  };
}

/**
 * Runs drift tests for multiple fixtures
 */
export async function runDriftSuite(
  provider: LLMProvider,
  fixtures: LoadedFixture[],
  options: {
    cycles?: number;
    verbose?: boolean;
  } = {}
): Promise<DriftTestResult[]> {
  const { cycles = 10, verbose = false } = options;
  const results: DriftTestResult[] = [];

  for (const fixture of fixtures) {
    if (verbose) {
      console.log(`\nDrift test: ${fixture.id}`);
    }

    const result = await runDriftTest({
      provider,
      fixture,
      cycles,
      verbose,
    });

    results.push(result);

    if (verbose) {
      const status = result.passed ? '✓ PASS' : '✗ FAIL';
      console.log(`  Result: ${status}`);
      if (result.failureReason) {
        console.log(`  Reason: ${result.failureReason}`);
      }
    }
  }

  return results;
}

/**
 * Formats drift test results for console output
 */
export function formatDriftResults(results: DriftTestResult[]): string {
  const lines = [
    '',
    '═══════════════════════════════════════════════════════════════',
    '  DRIFT TEST RESULTS',
    '═══════════════════════════════════════════════════════════════',
    '',
  ];

  for (const result of results) {
    const status = result.passed ? '✓' : '✗';
    lines.push(`  ${status} ${result.fixtureId}`);
    lines.push(`      Cycles: ${result.cycles.length - 1}`);
    lines.push(`      HTML Growth: ${result.metrics.htmlSizeGrowthPercent.toFixed(1)}%`);
    lines.push(`      CSS Growth: ${result.metrics.cssSizeGrowthPercent.toFixed(1)}%`);
    lines.push(`      Marker Drift: ${result.metrics.markerCountDrift}`);
    lines.push(`      Metadata Changed: ${result.metrics.metadataChanged}`);

    if (result.failureReason) {
      lines.push(`      Failure: ${result.failureReason}`);
    }
    lines.push('');
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  lines.push('─────────────────────────────────────────────────────────────');
  lines.push(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}
