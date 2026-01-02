/**
 * Anthropic Provider Client
 *
 * Handles LLM calls to Anthropic's API for HTML/CSS editing.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMRequest, LLMResponse } from '../../engine/types.js';
import { SYSTEM_PROMPT, createUserPrompt, parseResponse } from '../common/templates.js';

export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class AnthropicProvider implements LLMProvider {
  public readonly name = 'anthropic';
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: AnthropicConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model || 'claude-3-5-haiku-20241022';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.3;
  }

  async call(request: LLMRequest): Promise<LLMResponse> {
    const userPrompt = createUserPrompt({
      html: request.html,
      css: request.css,
      instruction: request.userPrompt,
    });

    const response = await this.client.messages.create({
      model: this.model,
      system: request.systemPrompt || SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: request.maxTokens || this.maxTokens,
      temperature: this.temperature,
    });

    // Extract text content from response
    let rawResponse = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        rawResponse += block.text;
      }
    }

    const { html, css } = parseResponse(rawResponse);

    return {
      html,
      css,
      rawResponse,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

/**
 * Creates an Anthropic provider from environment variables
 */
export function createAnthropicProvider(
  overrides?: Partial<AnthropicConfig>
): AnthropicProvider {
  const apiKey = overrides?.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  return new AnthropicProvider({
    apiKey,
    model: overrides?.model || process.env.LLM_MODEL,
    maxTokens: overrides?.maxTokens,
    temperature: overrides?.temperature,
  });
}
