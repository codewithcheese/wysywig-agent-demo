import { z } from 'zod';

// ============================================================================
// Fixture Schemas
// ============================================================================

export const ColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  tokenPath: z.string().optional(),
});

export const DataBlockPropsSchema = z.object({
  dataPath: z.string(),
  limit: z.number(),
  columns: z.array(ColumnSchema),
  display: z.enum(['table', 'grid']),
});

export const MarkerPatternSchema = z.object({
  pattern: z.string(),
  minCount: z.number().default(1),
  description: z.string().optional(),
});

export const MetadataInvariantSchema = z.object({
  componentType: z.string(),
  traitName: z.string(),
  expectedValue: z.unknown().optional(),
  mustExist: z.boolean().default(true),
});

export const ViewportSchema = z.object({
  width: z.number().default(1200),
  height: z.number().default(800),
});

export const FixtureSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  expectedMarkers: z.array(MarkerPatternSchema).default([]),
  expectedMetadata: z.array(MetadataInvariantSchema).default([]),
  viewport: ViewportSchema.optional(),
  visualDiffThreshold: z.number().default(0.05),
});

export type Column = z.infer<typeof ColumnSchema>;
export type DataBlockProps = z.infer<typeof DataBlockPropsSchema>;
export type MarkerPattern = z.infer<typeof MarkerPatternSchema>;
export type MetadataInvariant = z.infer<typeof MetadataInvariantSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;
export type Fixture = z.infer<typeof FixtureSchema>;

// ============================================================================
// GrapesJS Types
// ============================================================================

export interface GrapesJSProject {
  assets?: unknown[];
  styles?: unknown[];
  pages?: GrapesJSPage[];
  // Legacy single-page format
  components?: unknown[];
  css?: string;
}

export interface GrapesJSPage {
  id?: string;
  name?: string;
  component?: unknown;
  styles?: unknown[];
}

export interface ExportResult {
  html: string;
  css: string;
}

export interface ExportOptions {
  reimportable: boolean;
  includeWrapper?: boolean;
}

export interface ImportResult {
  success: boolean;
  error?: string;
  componentCount?: number;
  warnings?: string[];
}

// ============================================================================
// Validation Types
// ============================================================================

export interface MarkerValidationResult {
  passed: boolean;
  markers: {
    pattern: string;
    expected: number;
    found: number;
    passed: boolean;
  }[];
  totalExpected: number;
  totalFound: number;
}

export interface MetadataValidationResult {
  passed: boolean;
  components: {
    type: string;
    found: boolean;
    traits: {
      name: string;
      expected: unknown;
      actual: unknown;
      matched: boolean;
    }[];
  }[];
}

export interface ValidationResult {
  markers: MarkerValidationResult;
  metadata: MetadataValidationResult;
  sanitization: SanitizationResult;
  passed: boolean;
}

export interface SanitizationResult {
  passed: boolean;
  removed: {
    scripts: number;
    handlers: number;
    unsafeUrls: number;
    remoteImports: number;
  };
  sanitizedHtml: string;
  sanitizedCss: string;
  warnings: string[];
}

// ============================================================================
// Benchmark Types
// ============================================================================

export const PromptCategorySchema = z.enum([
  'cosmetic',
  'layout',
  'print',
  'metadata',
  'stress',
]);

export type PromptCategory = z.infer<typeof PromptCategorySchema>;

export const PromptCaseSchema = z.object({
  id: z.string(),
  category: PromptCategorySchema,
  description: z.string(),
  prompt: z.string(),
  expectedBehavior: z.string().optional(),
  markerSensitive: z.boolean().default(false),
});

export type PromptCase = z.infer<typeof PromptCaseSchema>;

export const SuiteSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  prompts: z.array(PromptCaseSchema),
});

export type Suite = z.infer<typeof SuiteSchema>;

export interface TestCaseConfig {
  fixtureId: string;
  promptId: string;
  provider: string;
  model: string;
  strategy: {
    exportFormat: 'plain' | 'reimportable';
    allowRepair: boolean;
    promptTemplate: string;
  };
}

export interface TestCaseResult {
  config: TestCaseConfig;
  timestamp: string;
  attempts: number;
  importSuccess: boolean;
  repairUsed: boolean;
  repairSuccess: boolean;
  markerPreserved: boolean;
  markerCounts: {
    before: number;
    after: number;
  };
  metadataPreserved: boolean;
  metadataDetails: MetadataValidationResult;
  diffStats: {
    htmlCharsBefore: number;
    htmlCharsAfter: number;
    cssCharsBefore: number;
    cssCharsAfter: number;
    htmlGrowthPercent: number;
    cssGrowthPercent: number;
  };
  timingsMs: {
    llm: number;
    sanitize: number;
    import: number;
    export: number;
    validate: number;
    render?: number;
    total: number;
  };
  errors: {
    phase: string;
    message: string;
    details?: unknown;
  }[];
  visualDiff?: {
    score: number;
    passed: boolean;
    beforePath?: string;
    afterPath?: string;
    diffPath?: string;
  };
  llmResponse?: {
    html: string;
    css?: string;
    rawResponse?: string;
  };
}

export interface BenchmarkSummary {
  runId: string;
  timestamp: string;
  provider: string;
  model: string;
  totalCases: number;
  passed: number;
  failed: number;
  metrics: {
    importSuccessRate: number;
    importSuccessWithRepairRate: number;
    markerPreservationRate: number;
    metadataPreservationRate: number;
    avgHtmlGrowthPercent: number;
    avgLlmTimeMs: number;
    avgTotalTimeMs: number;
  };
  visualMetrics?: {
    avgDiffScore: number;
    passRate: number;
  };
  failureBreakdown: {
    importFailures: number;
    markerLoss: number;
    metadataLoss: number;
    sanitizationFailures: number;
    visualDiffFailures: number;
  };
}

// ============================================================================
// LLM Provider Types
// ============================================================================

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  html: string;
  css: string;
  maxTokens?: number;
}

export interface LLMResponse {
  html: string;
  css: string;
  rawResponse: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMProvider {
  name: string;
  call(request: LLMRequest): Promise<LLMResponse>;
}

// ============================================================================
// Drift Detection Types
// ============================================================================

export interface DriftCycleResult {
  cycle: number;
  componentCount: number;
  markerCount: number;
  htmlSize: number;
  cssSize: number;
  metadataHash: string;
  importSuccess: boolean;
  error?: string;
}

export interface DriftTestResult {
  fixtureId: string;
  cycles: DriftCycleResult[];
  passed: boolean;
  failureReason?: string;
  metrics: {
    componentCountDrift: number;
    markerCountDrift: number;
    htmlSizeGrowthPercent: number;
    cssSizeGrowthPercent: number;
    metadataChanged: boolean;
  };
}
