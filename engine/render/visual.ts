/**
 * Visual Diff Rendering
 *
 * Uses Playwright to render HTML/CSS to screenshots and compute visual diffs.
 */

import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import type { Viewport } from '../types.js';

// Lazy-load Playwright to avoid requiring it when not using visual diffs
let playwright: typeof import('playwright') | null = null;

async function getPlaywright() {
  if (!playwright) {
    try {
      playwright = await import('playwright');
    } catch {
      throw new Error(
        'Playwright is required for visual diff testing. Run: npx playwright install chromium'
      );
    }
  }
  return playwright;
}

export interface RenderOptions {
  viewport?: Viewport;
  printMode?: boolean;
  waitFor?: number;
}

export interface VisualDiffResult {
  score: number;
  passed: boolean;
  beforePath: string;
  afterPath: string;
  diffPath: string;
  diffPixels: number;
  totalPixels: number;
}

/**
 * Renders HTML/CSS to a PNG screenshot
 */
export async function renderToScreenshot(
  html: string,
  css: string,
  outputPath: string,
  options: RenderOptions = {}
): Promise<void> {
  const pw = await getPlaywright();
  const { viewport = { width: 1200, height: 800 }, printMode = false, waitFor = 100 } = options;

  // Create full HTML document
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; }
    ${css}
  </style>
</head>
<body>
${html}
</body>
</html>`;

  const browser = await pw.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();

  try {
    // Set content
    await page.setContent(fullHtml, { waitUntil: 'networkidle' });

    // Wait for any animations
    await page.waitForTimeout(waitFor);

    // Apply print emulation if needed
    if (printMode) {
      await page.emulateMedia({ media: 'print' });
    }

    // Take screenshot
    await page.screenshot({
      path: outputPath,
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

/**
 * Computes visual diff between two images
 */
export async function computeVisualDiff(
  beforePath: string,
  afterPath: string,
  diffPath: string,
  threshold: number = 0.05
): Promise<VisualDiffResult> {
  // Import image libraries
  const { PNG } = await import('pngjs');
  const pixelmatch = (await import('pixelmatch')).default;

  // Read images
  const beforeBuffer = await readFile(beforePath);
  const afterBuffer = await readFile(afterPath);

  const beforePng = PNG.sync.read(beforeBuffer);
  const afterPng = PNG.sync.read(afterBuffer);

  // Ensure same dimensions (resize if needed)
  const width = Math.max(beforePng.width, afterPng.width);
  const height = Math.max(beforePng.height, afterPng.height);

  // Create canvases for comparison
  const before = new PNG({ width, height });
  const after = new PNG({ width, height });
  const diff = new PNG({ width, height });

  // Copy image data (with padding if sizes differ)
  copyWithPadding(beforePng, before);
  copyWithPadding(afterPng, after);

  // Compute diff
  const diffPixels = pixelmatch(before.data, after.data, diff.data, width, height, {
    threshold: 0.1,
    includeAA: true,
  });

  // Write diff image
  const diffBuffer = PNG.sync.write(diff);
  await writeFile(diffPath, diffBuffer);

  // Calculate score
  const totalPixels = width * height;
  const score = diffPixels / totalPixels;
  const passed = score <= threshold;

  return {
    score,
    passed,
    beforePath,
    afterPath,
    diffPath,
    diffPixels,
    totalPixels,
  };
}

/**
 * Copies PNG data with padding if needed
 */
function copyWithPadding(src: import('pngjs').PNG, dest: import('pngjs').PNG): void {
  for (let y = 0; y < dest.height; y++) {
    for (let x = 0; x < dest.width; x++) {
      const destIdx = (y * dest.width + x) * 4;

      if (x < src.width && y < src.height) {
        const srcIdx = (y * src.width + x) * 4;
        dest.data[destIdx] = src.data[srcIdx];
        dest.data[destIdx + 1] = src.data[srcIdx + 1];
        dest.data[destIdx + 2] = src.data[srcIdx + 2];
        dest.data[destIdx + 3] = src.data[srcIdx + 3];
      } else {
        // White padding
        dest.data[destIdx] = 255;
        dest.data[destIdx + 1] = 255;
        dest.data[destIdx + 2] = 255;
        dest.data[destIdx + 3] = 255;
      }
    }
  }
}

/**
 * Full visual comparison workflow
 */
export async function compareVisually(
  beforeHtml: string,
  beforeCss: string,
  afterHtml: string,
  afterCss: string,
  outputDir: string,
  options: {
    viewport?: Viewport;
    threshold?: number;
    prefix?: string;
  } = {}
): Promise<VisualDiffResult> {
  const { viewport, threshold = 0.05, prefix = '' } = options;

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  const beforePath = join(outputDir, `${prefix}before.png`);
  const afterPath = join(outputDir, `${prefix}after.png`);
  const diffPath = join(outputDir, `${prefix}diff.png`);

  // Render both versions
  await renderToScreenshot(beforeHtml, beforeCss, beforePath, { viewport });
  await renderToScreenshot(afterHtml, afterCss, afterPath, { viewport });

  // Compute diff
  const result = await computeVisualDiff(beforePath, afterPath, diffPath, threshold);

  return result;
}

/**
 * Checks if Playwright is available
 */
export async function isPlaywrightAvailable(): Promise<boolean> {
  try {
    await getPlaywright();
    return true;
  } catch {
    return false;
  }
}
