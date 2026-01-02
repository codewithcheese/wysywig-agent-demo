#!/usr/bin/env node
/**
 * Benchmark CLI
 *
 * Main entry point for running GrapesJS AI edit benchmarks.
 */

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { config } from 'dotenv';

import { loadConfig, getDefaultFixtures, getDefaultSuites } from './config.js';
import { loadFixtures, loadSuites, getAvailableFixtures, getAvailableSuites } from './loader.js';
import { executeTestCase } from './executor.js';
import { generateSummary, writeResults, formatSummary, generateRunId } from './reporter.js';
import { createProvider, type ProviderName } from '../../providers/index.js';
import type { TestCaseResult } from '../../engine/types.js';

// Load environment variables
config();

// CLI setup
program
  .name('grapesjs-ai-bench')
  .description('Benchmark harness for GrapesJS AI template editing')
  .version('0.1.0');

program
  .option('-p, --provider <provider>', 'LLM provider (openai or anthropic)', 'openai')
  .option('-m, --model <model>', 'Model name')
  .option('-f, --fixture <fixtures...>', 'Specific fixtures to run')
  .option('-s, --suite <suites...>', 'Specific suites to run')
  .option('--visual', 'Enable visual diff testing')
  .option('--no-repair', 'Disable repair attempts')
  .option('-o, --output <dir>', 'Output directory', 'bench/results')
  .option('-v, --verbose', 'Verbose output')
  .option('--dry-run', 'Show what would run without executing')
  .option('--list', 'List available fixtures and suites');

program.parse();

const opts = program.opts();

async function main() {
  // Handle --list
  if (opts.list) {
    const fixtures = await getAvailableFixtures();
    const suites = await getAvailableSuites();

    console.log(chalk.bold('\nAvailable Fixtures:'));
    for (const f of fixtures) {
      console.log(`  - ${f}`);
    }

    console.log(chalk.bold('\nAvailable Suites:'));
    for (const s of suites) {
      console.log(`  - ${s}`);
    }

    console.log('');
    return;
  }

  // Load configuration
  const benchConfig = loadConfig({
    provider: opts.provider as ProviderName,
    model: opts.model,
    fixtures: opts.fixture,
    suites: opts.suite,
    visual: opts.visual,
    allowRepair: opts.repair !== false,
    outputDir: opts.output,
    verbose: opts.verbose,
    dryRun: opts.dryRun,
  });

  console.log(chalk.bold.blue('\n🔬 GrapesJS AI Edit Benchmark\n'));
  console.log(`Provider: ${chalk.cyan(benchConfig.provider)}`);
  console.log(`Model: ${chalk.cyan(benchConfig.model || 'default')}`);
  console.log(`Repair: ${benchConfig.allowRepair ? chalk.green('enabled') : chalk.yellow('disabled')}`);
  console.log(`Visual: ${benchConfig.visual ? chalk.green('enabled') : chalk.gray('disabled')}`);
  console.log('');

  // Load fixtures and suites
  const fixtureIds = benchConfig.fixtures || getDefaultFixtures();
  const suiteIds = benchConfig.suites || getDefaultSuites();

  const spinner = ora('Loading fixtures and suites...').start();

  const fixtures = await loadFixtures(fixtureIds);
  const suites = await loadSuites(suiteIds);

  spinner.succeed(`Loaded ${fixtures.length} fixtures and ${suites.length} suites`);

  // Calculate total test cases
  const totalPrompts = suites.reduce((sum, s) => sum + s.suite.prompts.length, 0);
  const totalCases = fixtures.length * totalPrompts;

  console.log(`\nTotal test cases: ${chalk.bold(totalCases)}`);
  console.log(`  Fixtures: ${fixtureIds.join(', ')}`);
  console.log(`  Suites: ${suiteIds.join(', ')}`);
  console.log('');

  // Handle dry run
  if (benchConfig.dryRun) {
    console.log(chalk.yellow('Dry run - not executing tests\n'));

    for (const fixture of fixtures) {
      console.log(chalk.bold(`Fixture: ${fixture.id}`));
      for (const suite of suites) {
        console.log(`  Suite: ${suite.id}`);
        for (const prompt of suite.suite.prompts) {
          console.log(`    - ${prompt.id}: ${prompt.description}`);
        }
      }
    }
    return;
  }

  // Check for API key
  const apiKeyEnv = benchConfig.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  if (!process.env[apiKeyEnv]) {
    console.error(chalk.red(`Error: ${apiKeyEnv} environment variable is required`));
    process.exit(1);
  }

  // Create provider
  const provider = createProvider({
    name: benchConfig.provider,
    model: benchConfig.model,
  });

  // Run benchmark
  const runId = generateRunId();
  const results: TestCaseResult[] = [];
  let completed = 0;

  console.log(chalk.bold(`\nStarting benchmark run: ${runId}\n`));

  const progressSpinner = ora({
    text: `Running tests (0/${totalCases})...`,
    spinner: 'dots',
  }).start();

  for (const fixture of fixtures) {
    for (const suite of suites) {
      for (const prompt of suite.suite.prompts) {
        try {
          if (benchConfig.verbose) {
            progressSpinner.stop();
            console.log(chalk.gray(`\n[${fixture.id}] ${prompt.id}`));
          }

          const result = await executeTestCase({
            provider,
            fixture,
            prompt,
            allowRepair: benchConfig.allowRepair,
            verbose: benchConfig.verbose,
          });

          results.push(result);
          completed++;

          if (!benchConfig.verbose) {
            const status = result.importSuccess && result.markerPreserved
              ? chalk.green('✓')
              : chalk.red('✗');
            progressSpinner.text = `Running tests (${completed}/${totalCases})... ${status} ${fixture.id}/${prompt.id}`;
          } else {
            const status = result.importSuccess && result.markerPreserved
              ? chalk.green('PASS')
              : chalk.red('FAIL');
            console.log(`  Result: ${status}`);
            if (result.errors.length > 0) {
              for (const err of result.errors) {
                console.log(chalk.red(`    Error [${err.phase}]: ${err.message}`));
              }
            }
            progressSpinner.start(`Running tests (${completed}/${totalCases})...`);
          }
        } catch (error) {
          completed++;
          const errMsg = error instanceof Error ? error.message : String(error);
          if (benchConfig.verbose) {
            console.log(chalk.red(`  Error: ${errMsg}`));
          }

          results.push({
            config: {
              fixtureId: fixture.id,
              promptId: prompt.id,
              provider: provider.name,
              model: benchConfig.model || 'default',
              strategy: {
                exportFormat: 'reimportable',
                allowRepair: benchConfig.allowRepair,
                promptTemplate: 'default',
              },
            },
            timestamp: new Date().toISOString(),
            attempts: 1,
            importSuccess: false,
            repairUsed: false,
            repairSuccess: false,
            markerPreserved: false,
            markerCounts: { before: 0, after: 0 },
            metadataPreserved: false,
            metadataDetails: { passed: false, components: [] },
            diffStats: {
              htmlCharsBefore: fixture.html.length,
              htmlCharsAfter: 0,
              cssCharsBefore: fixture.css.length,
              cssCharsAfter: 0,
              htmlGrowthPercent: 0,
              cssGrowthPercent: 0,
            },
            timingsMs: { llm: 0, sanitize: 0, import: 0, export: 0, validate: 0, total: 0 },
            errors: [{ phase: 'execution', message: errMsg }],
          });
        }
      }
    }
  }

  progressSpinner.succeed(`Completed ${totalCases} test cases`);

  // Generate summary
  const summary = generateSummary(
    results,
    runId,
    benchConfig.provider,
    benchConfig.model || 'default'
  );

  // Write results
  const outputSpinner = ora('Writing results...').start();
  const outputPath = await writeResults(results, summary, benchConfig.outputDir);
  outputSpinner.succeed(`Results written to ${outputPath}`);

  // Print summary
  console.log(formatSummary(summary));

  // Exit with appropriate code
  const passRate = summary.passed / summary.totalCases;
  process.exit(passRate >= 0.9 ? 0 : 1);
}

main().catch((error) => {
  console.error(chalk.red('\nFatal error:'), error);
  process.exit(1);
});
