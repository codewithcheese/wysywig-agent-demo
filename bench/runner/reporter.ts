/**
 * Results Reporter
 *
 * Generates summary reports and writes results to files.
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { TestCaseResult, BenchmarkSummary } from '../../engine/types.js';

/**
 * Generates a benchmark summary from test results
 */
export function generateSummary(
  results: TestCaseResult[],
  runId: string,
  provider: string,
  model: string
): BenchmarkSummary {
  const successfulResults = results.filter((r) => r.importSuccess);
  const failedResults = results.filter((r) => !r.importSuccess);

  // Calculate metrics
  const importSuccessCount = successfulResults.length;
  const importSuccessWithRepair = results.filter(
    (r) => r.importSuccess && (r.repairSuccess || !r.repairUsed)
  ).length;
  const markerPreservedCount = successfulResults.filter((r) => r.markerPreserved).length;
  const metadataPreservedCount = successfulResults.filter((r) => r.metadataPreserved).length;

  const avgHtmlGrowth =
    successfulResults.length > 0
      ? successfulResults.reduce((sum, r) => sum + r.diffStats.htmlGrowthPercent, 0) /
        successfulResults.length
      : 0;

  const avgLlmTime =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.timingsMs.llm, 0) / results.length
      : 0;

  const avgTotalTime =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.timingsMs.total, 0) / results.length
      : 0;

  // Failure breakdown
  const importFailures = failedResults.length;
  const markerLoss = successfulResults.filter((r) => !r.markerPreserved).length;
  const metadataLoss = successfulResults.filter((r) => !r.metadataPreserved).length;
  const sanitizationFailures = results.filter(
    (r) => r.errors.some((e) => e.phase === 'sanitize')
  ).length;
  const visualDiffFailures = results.filter(
    (r) => r.visualDiff && !r.visualDiff.passed
  ).length;

  return {
    runId,
    timestamp: new Date().toISOString(),
    provider,
    model,
    totalCases: results.length,
    passed: successfulResults.filter(
      (r) => r.markerPreserved && r.metadataPreserved
    ).length,
    failed:
      failedResults.length +
      successfulResults.filter((r) => !r.markerPreserved || !r.metadataPreserved).length,
    metrics: {
      importSuccessRate: results.length > 0 ? importSuccessCount / results.length : 0,
      importSuccessWithRepairRate:
        results.length > 0 ? importSuccessWithRepair / results.length : 0,
      markerPreservationRate:
        successfulResults.length > 0 ? markerPreservedCount / successfulResults.length : 0,
      metadataPreservationRate:
        successfulResults.length > 0 ? metadataPreservedCount / successfulResults.length : 0,
      avgHtmlGrowthPercent: avgHtmlGrowth,
      avgLlmTimeMs: avgLlmTime,
      avgTotalTimeMs: avgTotalTime,
    },
    failureBreakdown: {
      importFailures,
      markerLoss,
      metadataLoss,
      sanitizationFailures,
      visualDiffFailures,
    },
  };
}

/**
 * Writes benchmark results to files
 */
export async function writeResults(
  results: TestCaseResult[],
  summary: BenchmarkSummary,
  outputDir: string
): Promise<string> {
  const runDir = join(outputDir, summary.runId);
  const casesDir = join(runDir, 'cases');

  // Create directories
  await mkdir(runDir, { recursive: true });
  await mkdir(casesDir, { recursive: true });

  // Write summary
  await writeFile(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));

  // Write individual case results
  for (const result of results) {
    const fileName = `${result.config.fixtureId}_${result.config.promptId}.json`;
    await writeFile(join(casesDir, fileName), JSON.stringify(result, null, 2));
  }

  return runDir;
}

/**
 * Formats a summary for console output
 */
export function formatSummary(summary: BenchmarkSummary): string {
  const { metrics, failureBreakdown } = summary;

  const lines = [
    '',
    '═══════════════════════════════════════════════════════════════',
    `  BENCHMARK RESULTS: ${summary.runId}`,
    '═══════════════════════════════════════════════════════════════',
    '',
    `  Provider: ${summary.provider}`,
    `  Model: ${summary.model}`,
    `  Total Cases: ${summary.totalCases}`,
    `  Passed: ${summary.passed}  |  Failed: ${summary.failed}`,
    '',
    '  ─── METRICS ─────────────────────────────────────────────────',
    '',
    `  Import Success Rate:        ${(metrics.importSuccessRate * 100).toFixed(1)}%`,
    `  Import w/ Repair Rate:      ${(metrics.importSuccessWithRepairRate * 100).toFixed(1)}%`,
    `  Marker Preservation:        ${(metrics.markerPreservationRate * 100).toFixed(1)}%`,
    `  Metadata Preservation:      ${(metrics.metadataPreservationRate * 100).toFixed(1)}%`,
    `  Avg HTML Growth:            ${metrics.avgHtmlGrowthPercent.toFixed(1)}%`,
    `  Avg LLM Time:               ${metrics.avgLlmTimeMs.toFixed(0)}ms`,
    `  Avg Total Time:             ${metrics.avgTotalTimeMs.toFixed(0)}ms`,
    '',
    '  ─── FAILURE BREAKDOWN ───────────────────────────────────────',
    '',
    `  Import Failures:            ${failureBreakdown.importFailures}`,
    `  Marker Loss:                ${failureBreakdown.markerLoss}`,
    `  Metadata Loss:              ${failureBreakdown.metadataLoss}`,
    `  Sanitization Failures:      ${failureBreakdown.sanitizationFailures}`,
  ];

  if (summary.visualMetrics) {
    lines.push('');
    lines.push('  ─── VISUAL DIFF ─────────────────────────────────────────────');
    lines.push('');
    lines.push(`  Visual Diff Pass Rate:      ${(summary.visualMetrics.passRate * 100).toFixed(1)}%`);
    lines.push(`  Avg Diff Score:             ${summary.visualMetrics.avgDiffScore.toFixed(4)}`);
    lines.push(`  Visual Failures:            ${failureBreakdown.visualDiffFailures}`);
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Add pass/fail summary
  const passRate = summary.totalCases > 0 ? summary.passed / summary.totalCases : 0;
  if (passRate >= 0.9) {
    lines.push('  ✓ PASS - Meets target thresholds');
  } else {
    lines.push('  ✗ FAIL - Below target thresholds');
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Generates a unique run ID
 */
export function generateRunId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}
