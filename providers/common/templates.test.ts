import { describe, it, expect } from 'vitest';
import {
  createUserPrompt,
  createRepairPrompt,
  createDriftPrompt,
  parseResponse,
} from './templates.js';

describe('createUserPrompt', () => {
  it('includes HTML content', () => {
    const prompt = createUserPrompt({
      html: '<div>Test</div>',
      css: '',
      instruction: 'Make it blue',
    });

    expect(prompt).toContain('<div>Test</div>');
    expect(prompt).toContain('Make it blue');
  });

  it('includes CSS when provided', () => {
    const prompt = createUserPrompt({
      html: '<div>Test</div>',
      css: 'div { color: red; }',
      instruction: 'Change color',
    });

    expect(prompt).toContain('div { color: red; }');
    expect(prompt).toContain('CSS');
  });

  it('includes constraint reminders', () => {
    const prompt = createUserPrompt({
      html: '<div>Test</div>',
      css: '',
      instruction: 'Edit',
    });

    expect(prompt).toContain('data-gjs-*');
    expect(prompt).toContain('scripts');
  });

  it('includes additional context when provided', () => {
    const prompt = createUserPrompt({
      html: '<div>Test</div>',
      css: '',
      instruction: 'Edit',
      additionalContext: 'This is for printing.',
    });

    expect(prompt).toContain('This is for printing.');
  });
});

describe('createRepairPrompt', () => {
  it('includes error message', () => {
    const prompt = createRepairPrompt({
      html: '<div>Broken</div>',
      css: '',
      error: 'Invalid HTML structure',
    });

    expect(prompt).toContain('Invalid HTML structure');
  });

  it('includes failed HTML', () => {
    const prompt = createRepairPrompt({
      html: '<div>Broken</div>',
      css: 'div { color: red; }',
      error: 'Parse error',
    });

    expect(prompt).toContain('<div>Broken</div>');
    expect(prompt).toContain('div { color: red; }');
  });

  it('includes original instruction when provided', () => {
    const prompt = createRepairPrompt({
      html: '<div>Test</div>',
      css: '',
      error: 'Error',
      originalInstruction: 'Make it blue',
    });

    expect(prompt).toContain('Make it blue');
  });
});

describe('createDriftPrompt', () => {
  it('asks for unchanged return', () => {
    const prompt = createDriftPrompt({
      html: '<div>Test</div>',
      css: 'div { color: red; }',
    });

    expect(prompt).toContain('without any modifications');
    expect(prompt).toContain('exact same content');
  });

  it('includes both HTML and CSS', () => {
    const prompt = createDriftPrompt({
      html: '<div>HTML</div>',
      css: '.css { }',
    });

    expect(prompt).toContain('<div>HTML</div>');
    expect(prompt).toContain('.css { }');
  });
});

describe('parseResponse', () => {
  it('extracts HTML from code blocks', () => {
    const response = `
      Here is the edited HTML:
      \`\`\`html
      <div>Edited</div>
      \`\`\`
    `;

    const result = parseResponse(response);
    expect(result.html).toBe('<div>Edited</div>');
  });

  it('extracts CSS from code blocks', () => {
    const response = `
      \`\`\`html
      <div>Content</div>
      \`\`\`

      \`\`\`css
      div { color: blue; }
      \`\`\`
    `;

    const result = parseResponse(response);
    expect(result.html).toBe('<div>Content</div>');
    expect(result.css).toBe('div { color: blue; }');
  });

  it('extracts CSS from embedded style tags', () => {
    const response = `
      \`\`\`html
      <div>Content</div>
      <style>div { color: green; }</style>
      \`\`\`
    `;

    const result = parseResponse(response);
    expect(result.css).toContain('color: green');
  });

  it('handles unlabeled code blocks', () => {
    const response = `
      \`\`\`
      <div>Content</div>
      \`\`\`
    `;

    const result = parseResponse(response);
    expect(result.html).toBe('<div>Content</div>');
  });

  it('extracts raw HTML without code blocks', () => {
    const response = 'Here is the result: <div class="new">Updated</div>';

    const result = parseResponse(response);
    expect(result.html).toContain('<div class="new">Updated</div>');
  });

  it('returns empty strings for no match', () => {
    const response = 'I cannot help with that request.';

    const result = parseResponse(response);
    expect(result.html).toBe('');
    expect(result.css).toBe('');
  });
});
