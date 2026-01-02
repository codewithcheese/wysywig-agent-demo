# GrapesJS ↔ AI Export/Import Editing — Automated Test Harness

This is an automated test harness for evaluating AI-driven template editing with GrapesJS:

**GrapesJS project → export HTML/CSS (re-importable) → LLM edits → import back into GrapesJS → validate → re-export → score**

## Goals

### Primary Goals

1. **Round-trip reliability** - Export → AI edit → import → re-export succeeds at high rates with GrapesJS metadata preserved
2. **Automated benchmark scoring** - Machine-readable metrics: success rates, marker preservation, metadata preservation, drift, visual similarity
3. **Failure mode discovery** - Identify which template structures + prompts break import/export
4. **Model comparison** - Run the same suite across providers/models and compare results

## Quick Start

### Prerequisites

- Node.js 20+
- API key for OpenAI or Anthropic
- (Optional) Playwright for visual diffs

### Installation

```bash
npm install

# Optional: Install Playwright for visual diffs
npx playwright install chromium
```

### Configuration

Create `.env` file:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

LLM_PROVIDER=openai      # or anthropic
LLM_MODEL=gpt-4-turbo-preview
```

### Running Benchmarks

```bash
# Run full benchmark suite
npm run bench

# Run specific fixture and suite
npm run bench -- --fixture=table-heavy --suite=layout

# Run with visual diffs
npm run bench -- --visual

# List available fixtures and suites
npm run bench -- --list

# Dry run (show what would run)
npm run bench -- --dry-run
```

## Project Structure

```
├── bench/
│   ├── runner/         # CLI benchmark runner
│   │   ├── cli.ts      # Main CLI entry point
│   │   ├── config.ts   # Configuration loading
│   │   ├── loader.ts   # Fixture/suite loaders
│   │   ├── executor.ts # Test case executor
│   │   ├── reporter.ts # Results reporting
│   │   └── drift.ts    # Drift detection
│   ├── suites/         # Prompt suites (JSON)
│   │   ├── cosmetic.json
│   │   ├── layout.json
│   │   ├── print.json
│   │   └── metadata.json
│   ├── fixtures/       # Test fixtures
│   │   ├── simple-one-page/
│   │   ├── two-column-hero/
│   │   ├── table-heavy/
│   │   ├── metadata-stress/
│   │   └── print-focused/
│   └── results/        # Benchmark outputs
├── engine/
│   ├── grapesjs/       # Headless GrapesJS loader/exporter/importer
│   ├── sanitize/       # HTML/CSS sanitizer
│   ├── validators/     # Marker + metadata validators
│   └── render/         # Playwright visual diff rendering
└── providers/
    ├── openai/         # OpenAI client
    ├── anthropic/      # Anthropic client
    └── common/         # Shared prompt templates
```

## Test Fixtures

Each fixture includes:

- `project.json` - GrapesJS project data
- `reimportable.html` - HTML with `data-gjs-*` markers
- `reimportable.css` - Associated styles
- `fixture.json` - Fixture configuration and expected invariants

### Available Fixtures

| Fixture | Description |
|---------|-------------|
| `simple-one-page` | Basic single-page layout with hero, content, footer |
| `two-column-hero` | Two-column layout with header, hero, main content, sidebar |
| `table-heavy` | Data tables with multiple sections |
| `metadata-stress` | Custom DataBlock components for metadata testing |
| `print-focused` | Print-optimized document with page breaks |

## Prompt Suites

### Cosmetic
Typography, spacing, colors, alignment changes

### Layout
Headers, footers, column layouts, structural changes

### Print
Page breaks, margins, print optimization

### Metadata
Stress tests for preserving component traits and markers

## Custom DataBlock Component

The harness includes a custom `DataBlock` component type for testing metadata preservation:

```html
<div
  data-gjs-type="data-block"
  data-gjs-trait-dataPath="api/users"
  data-gjs-trait-limit="10"
  data-gjs-trait-display="table"
  data-gjs-trait-columns='[{"key":"name","label":"Name"}]'
>
  <!-- placeholder content -->
</div>
```

Traits:
- `dataPath` - API endpoint path
- `limit` - Number of items to display
- `display` - Display mode (table/grid)
- `columns` - Column configuration (JSON)

## Validation

### Hard Fail Conditions

1. **Sanitization** - Removes scripts, event handlers, unsafe URLs
2. **Import/export success** - HTML must be valid and importable
3. **Marker preservation** - `data-gjs-*` attributes must be preserved
4. **Metadata preservation** - Component traits must remain intact

### Drift Detection

Runs N cycles of no-op edits to detect:
- Component count changes
- Marker loss
- HTML/CSS size growth ("ballooning")
- Metadata hash changes

## Output Format

Results are written to `bench/results/<timestamp>/`:

```
summary.json          # Aggregate metrics
cases/
  ├── fixture_prompt.json
  └── ...
visual/               # (if enabled)
  ├── before.png
  ├── after.png
  └── diff.png
```

### Summary Metrics

- Import success rate
- Import success with repair rate
- Marker preservation rate
- Metadata preservation rate
- Average HTML growth percentage
- Average LLM/total time

## Success Thresholds

| Metric | Target |
|--------|--------|
| Import success (first attempt) | ≥90% |
| Import success (with repair) | ≥97% |
| Metadata loss | 0% |
| Drift failures | 0 |
| Visual diff pass | ≥90% |

## CLI Options

```
Options:
  -p, --provider <provider>  LLM provider (openai or anthropic)
  -m, --model <model>        Model name
  -f, --fixture <fixtures>   Specific fixtures to run
  -s, --suite <suites>       Specific suites to run
  --visual                   Enable visual diff testing
  --no-repair                Disable repair attempts
  -o, --output <dir>         Output directory
  -v, --verbose              Verbose output
  --dry-run                  Show what would run
  --list                     List available fixtures and suites
```

## API Usage

```typescript
import { loadFixture, loadSuite } from './bench/runner/index.js';
import { executeTestCase } from './bench/runner/executor.js';
import { createProvider } from './providers/index.js';

const fixture = await loadFixture('simple-one-page');
const suite = await loadSuite('cosmetic');
const provider = createProvider({ name: 'openai' });

const result = await executeTestCase({
  provider,
  fixture,
  prompt: suite.suite.prompts[0],
  allowRepair: true,
});

console.log('Import success:', result.importSuccess);
console.log('Markers preserved:', result.markerPreserved);
```

## License

MIT
