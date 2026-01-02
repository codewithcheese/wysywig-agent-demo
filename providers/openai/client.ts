/**
 * OpenAI Provider Client
 *
 * Handles LLM calls to OpenAI's API for HTML/CSS editing.
 */

import OpenAI from 'openai';
import type { LLMProvider, LLMRequest, LLMResponse } from '../../engine/types.js';
import { SYSTEM_PROMPT, createUserPrompt, parseResponse } from '../common/templates.js';

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class OpenAIProvider implements LLMProvider {
  public readonly name = 'openai';
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
    this.model = config.model || 'gpt-4-turbo-preview';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.3;
  }

  async call(request: LLMRequest): Promise<LLMResponse> {
    const userPrompt = createUserPrompt({
      html: request.html,
      css: request.css,
      instruction: request.userPrompt,
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: request.systemPrompt || SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: request.maxTokens || this.maxTokens,
      temperature: this.temperature,
    });

    const rawResponse = response.choices[0]?.message?.content || '';
    const { html, css } = parseResponse(rawResponse);

    return {
      html,
      css,
      rawResponse,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }
}

/**
 * Creates an OpenAI provider from environment variables
 */
export function createOpenAIProvider(
  overrides?: Partial<OpenAIConfig>
): OpenAIProvider {
  const apiKey = overrides?.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  return new OpenAIProvider({
    apiKey,
    model: overrides?.model || process.env.LLM_MODEL,
    maxTokens: overrides?.maxTokens,
    temperature: overrides?.temperature,
  });
}
