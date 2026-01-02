/**
 * Prompt Templates for AI Template Editing
 *
 * These templates are designed to minimize marker loss and ensure
 * the AI produces valid, re-importable HTML/CSS.
 */

export const SYSTEM_PROMPT = `You are an expert HTML/CSS editor for a visual page builder.
Your task is to edit HTML templates while preserving their structure and metadata markers.

CRITICAL RULES - You MUST follow these exactly:

1. PRESERVE ALL data-gjs-* ATTRIBUTES
   - Every data-gjs-id, data-gjs-type, and data-gjs-trait-* attribute MUST remain unchanged
   - These are metadata markers required for the editor to function
   - Do NOT rename, remove, or modify these attributes

2. PRESERVE ALL IDs AND ANCHORS
   - Keep all id attributes on elements unchanged
   - Keep all data-* attributes unchanged unless they conflict with your edit

3. NO SCRIPTS OR EVENT HANDLERS
   - Do NOT add <script> tags
   - Do NOT add onclick, onload, or any on* event handlers
   - Do NOT add javascript: URLs

4. OUTPUT FORMAT
   - Return ONLY valid HTML
   - If you modify CSS, return it in a separate <style> block at the end
   - Do NOT include <!DOCTYPE>, <html>, <head>, or <body> tags unless they were in the input

5. MINIMAL CHANGES
   - Make only the changes requested
   - Do not "improve" or refactor code beyond the request
   - Preserve the existing structure as much as possible

When in doubt, err on the side of preserving existing markup.`;

/**
 * Creates a user prompt for HTML/CSS editing
 */
export function createUserPrompt(params: {
  html: string;
  css: string;
  instruction: string;
  additionalContext?: string;
}): string {
  const { html, css, instruction, additionalContext } = params;

  let prompt = `Here is the HTML content to edit:

\`\`\`html
${html}
\`\`\`
`;

  if (css && css.trim()) {
    prompt += `
Here is the associated CSS:

\`\`\`css
${css}
\`\`\`
`;
  }

  prompt += `
TASK: ${instruction}

Remember:
- Preserve ALL data-gjs-* attributes exactly as they are
- Preserve ALL id attributes
- Do NOT add scripts or event handlers
- Return only the edited HTML (and CSS if modified)
`;

  if (additionalContext) {
    prompt += `\n${additionalContext}`;
  }

  return prompt;
}

/**
 * Creates a repair prompt for fixing import failures
 */
export function createRepairPrompt(params: {
  html: string;
  css: string;
  error: string;
  originalInstruction?: string;
}): string {
  const { html, css, error, originalInstruction } = params;

  let prompt = `The following HTML failed to import back into the editor.

Error: ${error}

Here is the HTML that failed:

\`\`\`html
${html}
\`\`\`
`;

  if (css && css.trim()) {
    prompt += `
Here is the CSS:

\`\`\`css
${css}
\`\`\`
`;
  }

  prompt += `
Please fix the HTML so it can be imported successfully.

REQUIREMENTS:
1. Fix the specific error mentioned above
2. Ensure ALL data-gjs-* attributes are preserved
3. Ensure the HTML is valid and well-formed
4. Do NOT add scripts or event handlers
5. Return only the fixed HTML (and CSS if applicable)
`;

  if (originalInstruction) {
    prompt += `
The original edit request was: "${originalInstruction}"
Try to preserve the intent of that edit while fixing the import error.
`;
  }

  return prompt;
}

/**
 * Creates a drift-testing prompt (no-op edit)
 */
export function createDriftPrompt(params: {
  html: string;
  css: string;
}): string {
  const { html, css } = params;

  let prompt = `Here is HTML content:

\`\`\`html
${html}
\`\`\`
`;

  if (css && css.trim()) {
    prompt += `
Here is the CSS:

\`\`\`css
${css}
\`\`\`
`;
  }

  prompt += `
TASK: Return this HTML and CSS exactly as provided, without any modifications.

This is a verification test to ensure the content round-trips correctly.
Do NOT make any changes - return the exact same content.
`;

  return prompt;
}

/**
 * Extracts HTML and CSS from LLM response
 */
export function parseResponse(response: string): { html: string; css: string } {
  let html = '';
  let css = '';

  // Try to extract HTML from code blocks
  const htmlBlockRegex = /```(?:html)?\s*([\s\S]*?)```/gi;
  const cssBlockRegex = /```(?:css)?\s*([\s\S]*?)```/gi;

  // Find all code blocks
  const htmlMatches = [...response.matchAll(htmlBlockRegex)];
  const cssMatches = [...response.matchAll(cssBlockRegex)];

  // Check for explicit CSS blocks
  for (const match of cssMatches) {
    const content = match[1].trim();
    if (content && !content.includes('<') && content.includes('{')) {
      css = content;
    }
  }

  // Get HTML from the first appropriate block
  for (const match of htmlMatches) {
    const content = match[1].trim();
    // Skip if this looks like CSS
    if (content && content.includes('<') && !content.startsWith('{')) {
      html = content;
      break;
    }
  }

  // If no HTML found in blocks, try to find raw HTML
  if (!html) {
    // Look for HTML outside of code blocks
    const rawHtmlRegex = /<[a-z][\s\S]*>/i;
    const match = response.match(rawHtmlRegex);
    if (match) {
      html = match[0];
    }
  }

  // Extract embedded <style> blocks from HTML
  if (html && !css) {
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    const styleMatches = [...html.matchAll(styleRegex)];
    if (styleMatches.length > 0) {
      css = styleMatches.map((m) => m[1]).join('\n');
      // Remove style blocks from HTML
      html = html.replace(styleRegex, '');
    }
  }

  return { html: html.trim(), css: css.trim() };
}
