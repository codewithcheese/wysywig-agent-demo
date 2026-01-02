/**
 * Benchmark Configuration
 *
 * Loads and validates benchmark configuration from environment and CLI args.
 */

import { config } from 'dotenv';
import { z } from 'zod';
import type { ProviderName } from '../../providers/index.js';

// Load environment variables
config();

export const BenchConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic']).default('anthropic'),
  model: z.string().optional(),
  fixtures: z.array(z.string()).optional(),
  suites: z.array(z.string()).optional(),
  visual: z.boolean().default(false),
  parallel: z.number().min(1).max(10).default(1),
  allowRepair: z.boolean().default(true),
  outputDir: z.string().default('bench/results'),
  verbose: z.boolean().default(false),
  dryRun: z.boolean().default(false),
});

export type BenchConfig = z.infer<typeof BenchConfigSchema>;

export function loadConfig(overrides?: Partial<BenchConfig>): BenchConfig {
  const envConfig: Partial<BenchConfig> = {
    provider: (process.env.LLM_PROVIDER as ProviderName) || 'anthropic',
    model: process.env.LLM_MODEL,
    visual: process.env.VISUAL_DIFF_ENABLED === 'true',
    parallel: parseInt(process.env.BENCH_PARALLEL || '1', 10),
    allowRepair: process.env.BENCH_RETRY_REPAIR !== 'false',
  };

  return BenchConfigSchema.parse({
    ...envConfig,
    ...overrides,
  });
}

export function getDefaultSuites(): string[] {
  return ['cosmetic', 'layout', 'print', 'metadata'];
}

export function getDefaultFixtures(): string[] {
  return [
    'simple-one-page',
    'two-column-hero',
    'table-heavy',
    'metadata-stress',
    'print-focused',
  ];
}
